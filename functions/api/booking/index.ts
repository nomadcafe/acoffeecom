import { z } from 'zod';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookingAttempts, bookings, user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';
import {
  hasCollision,
  isSlotInAvailability,
  parseAvailability,
} from '../../_lib/booking';
import {
  renderVisitorConfirmRequestHtml,
} from '../../_lib/bookingEmails';
import { makeConfirmToken } from '../../_lib/cancelToken';

/**
 * Public booking-request endpoint — visitor submits a slot + name + email
 * + (optional) address + (optional) message. We do NOT pick a café here.
 *
 * Two-step gate:
 *  1. This endpoint inserts the row as `unconfirmed` and emails the
 *     visitor a magic link. The host is NOT notified yet.
 *  2. Visitor clicks the link → /api/booking/confirm-public flips the
 *     row to `requested` and finally emails the host.
 *
 * Why the verify step: anyone can type someone else's email here. Without
 * the verify, the host inbox would be a spam target. Forcing a click
 * proves the email is reachable AND that the person submitting is the
 * one who'll receive the host's reply — a free deliverability test
 * before we put a real human (the host) in the loop.
 *
 * It also validates the email shape end-to-end (typo'd domains bounce
 * at send time and we never bother the host).
 *
 * Anti-spam still applies (honeypot + per-IP rate limit + per-email
 * cooldown + slot-collision check). After verify, the host's approve
 * action in /api/bookings/[id]/approve is the gate that flips the row
 * to `pending` and emails the visitor with the chosen café + .ics.
 *
 * Steps in order:
 *  1. Honeypot + zod validation.
 *  2. Per-IP rate limit (booking_attempts table).
 *  3. Look up the organizer; require profile_public + home_base + a
 *     non-empty availability schedule.
 *  4. Slot must be in availability + ≥1h future + not collide with any
 *     existing unconfirmed/requested/pending booking.
 *  5. Per (organizer, email) cooldown — counts unconfirmed + requested +
 *     pending so an attacker can't squat slots from one mailbox.
 *  6. Insert with status 'unconfirmed'. Email visitor a magic-link.
 */

const InputSchema = z.object({
  username: z.string().trim().min(1).max(40),
  visitorName: z.string().trim().min(1).max(80),
  visitorEmail: z.string().trim().email().max(120),
  /** Optional in the request flow — visitor doesn't have to commit to
   *  an address upfront. When provided, the host's approve UI can
   *  show an AI-suggested midpoint café (added in a later commit);
   *  when omitted, the host picks freely. */
  visitorAddress: z.string().trim().min(2).max(200).optional(),
  scheduledAt: z.number().int().positive(),
  durationMinutes: z.number().int().min(15).max(180).default(60),
  /** Optional free-text note from the visitor. 500 chars matches the
   *  visit-note limit elsewhere in the app. Empty string treated as
   *  "no message" so we don't store dangling whitespace. */
  message: z.string().trim().max(500).optional(),
});

const COLLISION_WINDOW_MIN = 60;

/** Per-IP rate window. 5 booking attempts / hour is generous for any real
 *  user (nobody books 5 coffees in an hour) and tight enough that a bot
 *  hitting the endpoint can't burn through Resend quota. */
const RATE_LIMIT_PER_HOUR = 5;
/** Per (organizer, visitor email) cooldown. Prevents a single attacker
 *  from squatting every available slot under one person's identity, and
 *  prevents accidental double-booking when a user double-clicks submit. */
const EMAIL_COOLDOWN_HOURS = 24;

/** Statuses that hold a slot — i.e. a new request can't collide with
 *  any of these. `rejected` and `cancelled` free the slot back up.
 *  `unconfirmed` is included so a single visitor can't claim the same
 *  slot twice while they sit on the verify email. */
const ACTIVE_STATUSES = ['unconfirmed', 'requested', 'pending'] as const;

function generateBookingId(): string {
  return crypto.randomUUID();
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  // Honeypot + JSON parse. A zod failure on the honeypot field would
  // leak its name to a bot scraping error messages, so we explicitly
  // check the raw body before validation.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Invalid request body', 400);
  }
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as Record<string, unknown>).website === 'string' &&
    (raw as Record<string, string>).website.trim().length > 0
  ) {
    console.warn('[booking] honeypot triggered', request.headers.get('cf-connecting-ip'));
    return jsonError('Invalid request body', 400);
  }

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(raw);
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

  // ----- Rate limit: per-IP attempts in the last hour. -----
  const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  const [{ n: recentAttempts = 0 } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(bookingAttempts)
    .where(
      and(eq(bookingAttempts.ip, ip), gte(bookingAttempts.attemptedAt, hourAgo)),
    );
  if (recentAttempts >= RATE_LIMIT_PER_HOUR) {
    return jsonError('Too many booking attempts. Try again in an hour.', 429);
  }
  await db.insert(bookingAttempts).values({ ip, attemptedAt: new Date() });

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
    return jsonError("That slot is outside the host's available hours", 400);
  }

  // Per-email cooldown — counts active statuses including `requested`
  // so an attacker can't queue up multiple pending requests under one
  // identity.
  const cooldownStart = new Date(Date.now() - EMAIL_COOLDOWN_HOURS * 60 * 60_000);
  const visitorEmailLower = input.visitorEmail.toLowerCase();
  const [recentSame] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizerUserId, organizer.id),
        inArray(bookings.status, [...ACTIVE_STATUSES]),
        sql`lower(${bookings.visitorEmail}) = ${visitorEmailLower}`,
        gte(bookings.createdAt, cooldownStart),
      ),
    )
    .limit(1);
  if (recentSame) {
    return jsonError(
      'You already have a pending coffee with this person. Wait for their reply or pick a different time.',
      429,
    );
  }

  // Collision — `requested` rows hold the slot the same as `pending`,
  // otherwise two visitors could queue requests for the same time and
  // the host would have to reject one. Better to surface the conflict
  // to the second visitor right now.
  const windowMs = COLLISION_WINDOW_MIN * 60_000;
  const existing = await db
    .select({
      scheduledAt: bookings.scheduledAt,
      durationMinutes: bookings.durationMinutes,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizerUserId, organizer.id),
        inArray(bookings.status, [...ACTIVE_STATUSES]),
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

  // Insert as 'unconfirmed' — the visitor's email click is the gate
  // that promotes this row to 'requested' and notifies the host. Café
  // / lat-lng / approved_at all null until the host approves later.
  const id = generateBookingId();
  const now = new Date();
  await db.insert(bookings).values({
    id,
    organizerUserId: organizer.id,
    visitorEmail: input.visitorEmail,
    visitorName: input.visitorName,
    visitorAddress: input.visitorAddress ?? null,
    visitorLat: null,
    visitorLng: null,
    scheduledAt: new Date(slotMs),
    durationMinutes: duration,
    placeId: null,
    placeName: null,
    placeAddress: null,
    placeLat: null,
    placeLng: null,
    status: 'unconfirmed',
    approvedAt: null,
    visitorMessage: input.message?.trim() ? input.message.trim() : null,
    createdAt: now,
  });

  // Email visitor a magic link. The host hears nothing until the
  // visitor clicks. Same shape as the legacy auto-confirm flow's
  // confirm-link, just routed to /api/booking/confirm-public which
  // now flips into 'requested' (not 'pending').
  const handle = organizer.displayName?.trim() || `@${organizer.username ?? 'host'}`;
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    /* Confirm link expires 7 days after issuance, OR at the slot itself
     * if that's sooner — past-slot clicks are already 410'd in
     * confirm-public, but rejecting at token level too means the limit
     * applies even if the state machine ever changes. */
    const confirmExpiresAt = Math.min(now.getTime() + 7 * 24 * 60 * 60_000, slotMs);
    const confirmToken = await makeConfirmToken(env.AUTH_SECRET, id, confirmExpiresAt);
    const confirmUrl = `https://acoffee.com/booking/confirm?id=${encodeURIComponent(id)}&t=${encodeURIComponent(confirmToken)}`;
    const startStr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(slotMs));

    const resend = new Resend(env.RESEND_API_KEY);
    await Promise.allSettled([
      resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: input.visitorEmail,
        // Reply-to = host email so a "wait, never mind" reply still
        // reaches a human, even though the host doesn't know yet that
        // the request exists.
        replyTo: organizer.email,
        subject: `Confirm your coffee request to ${handle} ☕`,
        html: renderVisitorConfirmRequestHtml({
          hostHandle: handle,
          visitorName: input.visitorName,
          startStr,
          confirmUrl,
        }),
      }),
    ]);
  }

  return Response.json({
    booking: {
      id,
      scheduledAt: slotMs,
      durationMinutes: duration,
      status: 'unconfirmed' as const,
    },
    /** Tells the BookingWidget to render the "check your inbox" state
     *  rather than "request sent to host". */
    requiresEmailVerification: true,
  });
};
