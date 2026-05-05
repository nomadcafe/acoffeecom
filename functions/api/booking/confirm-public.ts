import { z } from 'zod';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookings, user } from '../../_lib/db/schema';
import { jsonError, jsonErrorCoded } from '../../_lib/jsonError';
import { verifyConfirmToken } from '../../_lib/cancelToken';
import { hasCollision } from '../../_lib/booking';
import {
  formatTimePair,
  renderHostRequestReceivedHtml,
} from '../../_lib/bookingEmails';

/** Mirrors the slot-collision constants in POST /api/booking. We re-check
 *  before promoting unconfirmed → requested because hours-to-days can
 *  pass between the visitor's submit and their email click; another
 *  visitor (or the host's own /bookings card) could have claimed the
 *  same slot in that gap. */
const COLLISION_WINDOW_MIN = 60;
const ACTIVE_STATUSES = ['unconfirmed', 'requested', 'pending'] as const;

/**
 * Visitor click-through after they submit a booking request. Verifies
 * their email is real, flips the row from 'unconfirmed' to 'requested',
 * and finally notifies the host that there's something to action on
 * /bookings.
 *
 * Pre-flow rewrite this endpoint flipped 'unconfirmed' → 'pending' and
 * sent calendar invites; the host is no longer auto-confirmed at submit
 * time, so this step now hands the request off rather than completing
 * the booking. The host's approve action in /api/bookings/:id/approve
 * is what produces the confirmation + .ics for both sides.
 *
 * Idempotent: clicking the same link twice returns the same response,
 * doesn't re-send emails. Token verifies HMAC over `confirm:<id>` so the
 * cancel-link token can't be used here (and vice versa).
 */

const InputSchema = z.object({
  id: z.string().uuid(),
  token: z.string().min(8).max(120),
});

interface ConfirmResponse {
  ok: true;
  alreadyConfirmed?: boolean;
  hostHandle: string;
  startedAt: number;
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const ok = await verifyConfirmToken(env.AUTH_SECRET, input.id, input.token);
  if (!ok) return jsonError('Invalid confirmation link', 403);

  const db = getDb(env);
  const [row] = await db.select().from(bookings).where(eq(bookings.id, input.id));
  if (!row) return jsonError('Booking not found', 404);

  const startMs =
    row.scheduledAt instanceof Date ? row.scheduledAt.getTime() : Number(row.scheduledAt);

  const [organizer] = await db
    .select({
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      timezone: user.timezone,
    })
    .from(user)
    .where(eq(user.id, row.organizerUserId));

  const handle = organizer?.displayName?.trim() || `@${organizer?.username ?? 'host'}`;

  /* State branches. The previous version of this endpoint collapsed
   * everything-not-unconfirmed into `alreadyConfirmed:false` ok-success,
   * which meant a visitor whose booking the host had already rejected
   * (or that the visitor themselves cancelled) saw "Request sent to
   * your host" — a confidently false claim. Each terminal state now
   * returns a distinct error so ConfirmBookingPage can render the
   * right localized copy. */
  if (row.status === 'cancelled') {
    return jsonErrorCoded('This booking was cancelled.', 'cancelled', 410, {
      hostHandle: handle,
      startedAt: startMs,
    });
  }
  if (row.status === 'rejected') {
    return jsonErrorCoded('This booking request was declined.', 'rejected', 410, {
      hostHandle: handle,
      startedAt: startMs,
    });
  }
  if (row.status === 'requested' || row.status === 'pending') {
    /* Already-confirmed re-click — visitor re-opened their inbox
     * after seeing the success page. Idempotent success. */
    const resp: ConfirmResponse = {
      ok: true,
      alreadyConfirmed: true,
      hostHandle: handle,
      startedAt: startMs,
    };
    return Response.json(resp);
  }

  // Stale-link guard. Verification links live for as long as it takes a
  // visitor to find their inbox, which can be days. If the slot itself is
  // now in the past, promoting it just emails the host about a coffee
  // that already happened (or didn't). Surface the failure so the visitor
  // re-books rather than silently promoting a dead row.
  if (startMs <= Date.now()) {
    return jsonError('That booking time has already passed — please book again.', 410);
  }

  // Re-check slot collision. The original POST checked at submit time
  // and counted 'unconfirmed' rows toward the slot count, but the gap
  // between submit and confirm-click can stretch hours-to-days; in that
  // window another visitor might have submitted+confirmed, or the host
  // could have manually created a pending. Excluding self by id so this
  // row's own 'unconfirmed' state doesn't count.
  const windowMs = COLLISION_WINDOW_MIN * 60_000;
  const existing = await db
    .select({
      scheduledAt: bookings.scheduledAt,
      durationMinutes: bookings.durationMinutes,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizerUserId, row.organizerUserId),
        ne(bookings.id, row.id),
        inArray(bookings.status, [...ACTIVE_STATUSES]),
        gte(bookings.scheduledAt, new Date(startMs - windowMs * 4)),
        lte(bookings.scheduledAt, new Date(startMs + windowMs * 4)),
      ),
    );
  const existingMs = existing.map((b) => ({
    scheduledAt: b.scheduledAt instanceof Date ? b.scheduledAt.getTime() : Number(b.scheduledAt),
    durationMinutes: b.durationMinutes,
  }));
  if (hasCollision(startMs, row.durationMinutes, existingMs)) {
    return jsonError('That slot is no longer available — please pick another time.', 409);
  }

  // Promote unconfirmed → requested. Slot is now visibly held against
  // any future booking from anyone (collision check in POST /api/booking
  // already counted unconfirmed too, so nothing changes from the slot
  // perspective; the difference is the host now gets notified).
  await db.update(bookings).set({ status: 'requested' }).where(eq(bookings.id, input.id));

  // Email host: "X verified, click /bookings to review." Reuses the
  // host-request-received template the request flow uses everywhere
  // else for consistency.
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && organizer?.email) {
    const startStr = formatTimePair(
      startMs,
      { tz: organizer.timezone || 'UTC', label: 'host' },
      null,
    );
    const reviewUrl = 'https://acoffee.com/bookings';
    const resend = new Resend(env.RESEND_API_KEY);
    /* Notification email — log on failure but don't fail the API. The
     * status flip already committed; if Resend blips, the host will
     * still discover the new request next time they open /bookings. */
    try {
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: organizer.email,
        replyTo: row.visitorEmail,
        subject: `${row.visitorName} wants to grab a coffee ☕`,
        html: renderHostRequestReceivedHtml({
          hostHandle: handle,
          visitorName: row.visitorName,
          visitorEmail: row.visitorEmail,
          startStr,
          message: row.visitorMessage ?? null,
          reviewUrl,
        }),
      });
    } catch (e) {
      console.error('[booking-emails] host request-received send failed', {
        bookingId: row.id,
        to: organizer.email,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const resp: ConfirmResponse = {
    ok: true,
    hostHandle: handle,
    startedAt: startMs,
  };
  return Response.json(resp);
};
