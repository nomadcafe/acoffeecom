import { z } from 'zod';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { bookings, user } from '../../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../../_lib/passport';
import {
  hasCollision,
  isSlotInAvailability,
  parseAvailability,
} from '../../../_lib/booking';
import {
  formatTimePair,
  renderVisitorConfirmationHtml,
} from '../../../_lib/bookingEmails';

/**
 * Host approves a `requested` booking. Body contains the café the host
 * picked AND optionally a new scheduledAt — the host can offer a
 * different time as part of the approve action ("yes, but at 4pm
 * instead of 3pm"). Visitor gets the resulting time + venue in the
 * confirmation email; if it doesn't work for them they can use the
 * cancel link in that email.
 *
 * Picking the café itself can come from Places autocomplete, the host's
 * featured cafés (quick-pick), or — later — an AI-suggested midpoint
 * between visitor's address and host home base. The endpoint just
 * persists what the host chose; the picker UI lives client-side.
 *
 * On success: status flips `requested` → `pending`, place_* fields are
 * filled, scheduledAt updated if the host changed it, approved_at is
 * set, and the visitor gets a "X said yes, meet at <café> at <time>"
 * email. Idempotent if already approved with the same place + time.
 *
 * Auth: must be the organizer of the booking. Visitor cannot approve
 * their own request.
 */

const InputSchema = z.object({
  placeId: z.string().trim().min(1).max(120),
  placeName: z.string().trim().min(1).max(200),
  placeAddress: z.string().trim().min(1).max(300),
  placeLat: z.number(),
  placeLng: z.number(),
  /** Optional Google Maps deep link from the picker — surfaces the
   *  "Open in Maps" CTA in the visitor's confirmation email. */
  googleMapsUri: z.string().url().max(500).optional(),
  /** Optional new time for the booking (UTC ms). When provided and
   *  different from the current row, server validates against the
   *  host's availability schedule + slot collision before accepting. */
  scheduledAt: z.number().int().positive().optional(),
});

const COLLISION_WINDOW_MIN = 60;
const ACTIVE_STATUSES = ['unconfirmed', 'requested', 'pending'] as const;

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const ctx = await getSessionContext(env, request);
  if (!ctx) return jsonError('Unauthorized', 401);

  const id = typeof params.id === 'string' ? params.id : '';
  if (!id) return jsonError('Missing booking id', 400);

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.organizerUserId, ctx.user.id)));

  if (!row) return jsonError('Booking not found', 404);

  if (row.status === 'pending' && row.placeId) {
    // Idempotent re-approve: same café already saved → no-op.
    return Response.json({ ok: true, alreadyApproved: true });
  }
  if (row.status !== 'requested') {
    return jsonError(
      `Cannot approve a ${row.status} booking — only 'requested' rows are pending host approval.`,
      409,
    );
  }

  const originalMs =
    row.scheduledAt instanceof Date ? row.scheduledAt.getTime() : Number(row.scheduledAt);
  let finalMs = originalMs;

  // ----- Time-change validation (only when host actually changed it) -----
  if (input.scheduledAt && input.scheduledAt !== originalMs) {
    if (input.scheduledAt <= Date.now() + 60 * 60_000) {
      return jsonError('Slot must be at least 1 hour in the future', 400);
    }
    const [organizerRow] = await db
      .select({
        availabilitySlots: user.availabilitySlots,
        timezone: user.timezone,
      })
      .from(user)
      .where(eq(user.id, ctx.user.id));
    const availability = parseAvailability(organizerRow?.availabilitySlots);
    const tz = organizerRow?.timezone || 'UTC';
    if (!isSlotInAvailability(input.scheduledAt, row.durationMinutes, availability, tz)) {
      return jsonError("That time is outside your availability — open Account → Booking to widen it.", 400);
    }
    // Collision check against other active bookings — exclude THIS row
    // so we don't count the booking against itself when host shifts time.
    const windowMs = COLLISION_WINDOW_MIN * 60_000;
    const existing = await db
      .select({
        scheduledAt: bookings.scheduledAt,
        durationMinutes: bookings.durationMinutes,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.organizerUserId, ctx.user.id),
          inArray(bookings.status, [...ACTIVE_STATUSES]),
          ne(bookings.id, id),
          gte(bookings.scheduledAt, new Date(input.scheduledAt - windowMs * 4)),
          lte(bookings.scheduledAt, new Date(input.scheduledAt + windowMs * 4)),
        ),
      );
    const existingMs = existing.map((b) => ({
      scheduledAt: b.scheduledAt instanceof Date ? b.scheduledAt.getTime() : Number(b.scheduledAt),
      durationMinutes: b.durationMinutes,
    }));
    if (hasCollision(input.scheduledAt, row.durationMinutes, existingMs)) {
      return jsonError('That time conflicts with another booking', 409);
    }
    finalMs = input.scheduledAt;
  }

  const now = new Date();
  await db
    .update(bookings)
    .set({
      status: 'pending',
      placeId: input.placeId,
      placeName: input.placeName,
      placeAddress: input.placeAddress,
      placeLat: input.placeLat,
      placeLng: input.placeLng,
      scheduledAt: new Date(finalMs),
      approvedAt: now,
    })
    .where(eq(bookings.id, id));

  // Email visitor: "X said yes! Meet at Y" with the café details
  // (and the new time, if changed).
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    const [organizer] = await db
      .select({
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        timezone: user.timezone,
        homeBaseAddress: user.homeBaseAddress,
      })
      .from(user)
      .where(eq(user.id, ctx.user.id));

    if (organizer) {
      const handle = organizer.displayName?.trim() || `@${organizer.username ?? 'host'}`;
      const startStr = formatTimePair(
        finalMs,
        { tz: organizer.timezone || 'UTC', label: 'host' },
        null,
      );
      const subject =
        finalMs !== originalMs
          ? `${handle} said yes — at ${input.placeName} (new time) ☕`
          : `${handle} said yes — coffee at ${input.placeName} ☕`;
      const resend = new Resend(env.RESEND_API_KEY);
      await Promise.allSettled([
        resend.emails.send({
          from: env.RESEND_FROM_EMAIL,
          to: row.visitorEmail,
          replyTo: organizer.email,
          subject,
          html: renderVisitorConfirmationHtml({
            startStr,
            cafeName: input.placeName,
            cafeAddress: input.placeAddress,
            cafeMaps: input.googleMapsUri ?? null,
            visitorName: row.visitorName,
            visitorEmail: row.visitorEmail,
            visitorAddress: row.visitorAddress ?? '',
            hostHandle: handle,
            hostHomeBase: organizer.homeBaseAddress ?? '',
            visitorMessage: row.visitorMessage ?? null,
          }),
        }),
      ]);
    }
  }

  return Response.json({
    ok: true,
    booking: {
      id,
      status: 'pending' as const,
      scheduledAt: finalMs,
      durationMinutes: row.durationMinutes,
      placeId: input.placeId,
      placeName: input.placeName,
      placeAddress: input.placeAddress,
      placeLat: input.placeLat,
      placeLng: input.placeLng,
    },
  });
};
