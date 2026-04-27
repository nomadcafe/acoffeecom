import { z } from 'zod';
import { and, eq, gte, lte } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookings, user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';
import {
  GoogleMapsError,
  geocodeAddress,
  midpointOf,
  pickBestCafe,
  searchNearbyCafes,
} from '../../_lib/googleMaps';
import {
  buildIcs,
  hasCollision,
  isSlotInAvailability,
  parseAvailability,
} from '../../_lib/booking';
import {
  formatTimePair,
  renderOrganizerConfirmationHtml,
  renderVisitorConfirmationHtml,
} from '../../_lib/bookingEmails';
import { makeCancelToken } from '../../_lib/cancelToken';

/**
 * Public booking endpoint — visitor submits their address + a chosen slot
 * and we (in order):
 *
 *  1. Validate input shape (zod)
 *  2. Look up the organizer; require profile_public + home_base + a non-
 *     empty availability schedule. Same 404 message for missing data so
 *     we don't leak which usernames have configured bookings.
 *  3. Reject slots in the past, slots outside the weekly availability,
 *     and slots that collide with an existing booking on a ±60min window.
 *  4. Geocode both addresses and auto-pick a café via the Places (New)
 *     API — same logic as /api/booking/preview, just persisted.
 *  5. Insert the row with status 'pending', then fire two Resend emails
 *     (organizer + visitor) each with an .ics attachment so it lands in
 *     real calendars. Send failures don't roll back the booking; the row
 *     stays so a manual resend tool (later) can recover.
 */

const InputSchema = z.object({
  username: z.string().trim().min(1).max(40),
  visitorName: z.string().trim().min(1).max(80),
  visitorEmail: z.string().trim().email().max(120),
  visitorAddress: z.string().trim().min(2).max(200),
  scheduledAt: z.number().int().positive(),
  durationMinutes: z.number().int().min(15).max(180).default(60),
});

const COLLISION_WINDOW_MIN = 60;

function generateBookingId(): string {
  // Compact unique id; readable enough to grep DB by. crypto.randomUUID is
  // available in Workers runtime.
  return crypto.randomUUID();
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }
  const username = input.username.toLowerCase();
  const slotMs = input.scheduledAt;
  const duration = input.durationMinutes;

  if (slotMs <= Date.now() + 60 * 60_000) {
    return jsonError('Slot must be at least 1 hour in the future', 400);
  }

  const db = getDb(env);
  const [organizer] = await db
    .select({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      homeBaseAddress: user.homeBaseAddress,
      availabilitySlots: user.availabilitySlots,
      timezone: user.timezone,
      profilePublic: user.profilePublic,
    })
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));

  if (!organizer || !organizer.homeBaseAddress) {
    return jsonError("This user hasn't set up bookings yet", 404);
  }

  const availability = parseAvailability(organizer.availabilitySlots);
  const tz = organizer.timezone || 'UTC';
  if (!isSlotInAvailability(slotMs, duration, availability, tz)) {
    return jsonError('That slot is outside the host\'s available hours', 400);
  }

  // Collision check: any booking within ±COLLISION_WINDOW_MIN of the proposed
  // slot. We search a wider DB window then call hasCollision() for exact
  // overlap so we don't depend on every booking having the same duration.
  const windowMs = COLLISION_WINDOW_MIN * 60_000;
  const existing = await db
    .select({ scheduledAt: bookings.scheduledAt, durationMinutes: bookings.durationMinutes })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizerUserId, organizer.id),
        eq(bookings.status, 'pending'),
        gte(bookings.scheduledAt, new Date(slotMs - windowMs * 4)),
        lte(bookings.scheduledAt, new Date(slotMs + windowMs * 4)),
      ),
    );
  const existingMs = existing.map((b) => ({
    scheduledAt: b.scheduledAt instanceof Date ? b.scheduledAt.getTime() : Number(b.scheduledAt),
    durationMinutes: b.durationMinutes,
  }));
  if (hasCollision(slotMs, duration, existingMs)) {
    return jsonError('That slot is already booked', 409);
  }

  // Geocode + auto-pick. Fail fast on bad addresses.
  let visitorLoc, organizerLoc, cafe;
  try {
    [organizerLoc, visitorLoc] = await Promise.all([
      geocodeAddress(env, organizer.homeBaseAddress),
      geocodeAddress(env, input.visitorAddress),
    ]);
    const mid = midpointOf(organizerLoc, visitorLoc);
    let candidates = await searchNearbyCafes(env, mid, 1500, 10);
    if (candidates.length === 0) {
      candidates = await searchNearbyCafes(env, mid, 5000, 10);
    }
    cafe = pickBestCafe(candidates);
  } catch (e) {
    if (e instanceof GoogleMapsError) {
      return jsonError(`Couldn't pick a café — ${e.message}`, e.status);
    }
    throw e;
  }
  if (!cafe) return jsonError('No nearby cafés found between you', 404);

  const id = generateBookingId();
  const now = new Date();
  await db.insert(bookings).values({
    id,
    organizerUserId: organizer.id,
    visitorEmail: input.visitorEmail,
    visitorName: input.visitorName,
    visitorAddress: input.visitorAddress,
    visitorLat: visitorLoc.lat,
    visitorLng: visitorLoc.lng,
    scheduledAt: new Date(slotMs),
    durationMinutes: duration,
    placeId: cafe.placeId,
    placeName: cafe.name,
    placeAddress: cafe.address,
    placeLat: cafe.lat,
    placeLng: cafe.lng,
    status: 'pending',
    createdAt: now,
  });

  // Fire-and-forget the two emails. A failure logs but doesn't roll back —
  // the booking is real, we just lose the invite. Manual resend later.
  // Each side gets a tailored email: organizer sees who's coming, visitor
  // sees host info + a self-serve cancel link.
  const handle = organizer.displayName?.trim() || `@${organizer.username ?? 'host'}`;
  const startStr = formatTimePair(
    slotMs,
    { tz: organizer.timezone || 'UTC', label: 'host' },
    null,
  );
  const ics = buildIcs({
    uid: `${id}@acoffee.com`,
    startMs: slotMs,
    durationMin: duration,
    summary: `Coffee with ${handle}`,
    description:
      `Auto-picked by ACoffee — midpoint between you both.\n\n` +
      `Café: ${cafe.name}\nAddress: ${cafe.address}\n` +
      (cafe.googleMapsUri ? `Maps: ${cafe.googleMapsUri}\n` : ''),
    location: `${cafe.name}, ${cafe.address}`,
    organizerEmail: organizer.email,
    attendeeEmail: input.visitorEmail,
  });
  const icsB64 = btoa(ics);

  const cancelToken = await makeCancelToken(env.AUTH_SECRET, id);
  const cancelUrl = `https://acoffee.com/booking/cancel?id=${encodeURIComponent(id)}&t=${encodeURIComponent(cancelToken)}`;

  const sharedConfirm = {
    startStr,
    cafeName: cafe.name,
    cafeAddress: cafe.address,
    cafeMaps: cafe.googleMapsUri,
    visitorName: input.visitorName,
    visitorEmail: input.visitorEmail,
    visitorAddress: input.visitorAddress,
    hostHandle: handle,
    hostHomeBase: organizer.homeBaseAddress,
  };

  const resend = new Resend(env.RESEND_API_KEY);
  await Promise.allSettled([
    resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: organizer.email,
      subject: `${input.visitorName} booked a coffee with you ☕`,
      html: renderOrganizerConfirmationHtml(sharedConfirm),
      attachments: [{ filename: 'coffee.ics', content: icsB64 }],
    }),
    resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.visitorEmail,
      subject: `Coffee with ${handle} confirmed ☕`,
      html: renderVisitorConfirmationHtml({ ...sharedConfirm, cancelUrl }),
      attachments: [{ filename: 'coffee.ics', content: icsB64 }],
    }),
  ]);

  return Response.json({
    booking: { id, scheduledAt: slotMs, durationMinutes: duration },
    cafe,
  });
};
