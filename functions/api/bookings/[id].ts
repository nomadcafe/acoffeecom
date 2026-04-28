import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookings, user } from '../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../_lib/passport';
import {
  formatTimePair,
  renderVisitorCancellationHtml,
  renderVisitorRescheduleRequestHtml,
} from '../../_lib/bookingEmails';

/**
 * Cancels a booking. Only the organizer can cancel. The same endpoint
 * handles "reschedule" via `?intent=reschedule` — under the hood that's
 * still a cancel, but the email to the visitor asks them to pick a new
 * slot (with a CTA back to the host's profile) instead of just saying
 * sorry. Either way the row flips to status='cancelled' so the slot is
 * freed for the next booker.
 *
 * Past bookings are marked cancelled silently — telling someone "your
 * meeting last Tuesday was cancelled" makes no sense.
 *
 * Idempotent: cancelling an already-cancelled booking returns 200, no email.
 */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const ctx = await getSessionContext(env, request);
  if (!ctx) return jsonError('Unauthorized', 401);

  const id = typeof params.id === 'string' ? params.id : '';
  if (!id) return jsonError('Missing booking id', 400);

  const url = new URL(request.url);
  const intent = url.searchParams.get('intent') === 'reschedule' ? 'reschedule' : 'cancel';

  const db = getDb(env);
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.organizerUserId, ctx.user.id)));

  if (!row) return jsonError('Booking not found', 404);

  if (row.status === 'cancelled') {
    return Response.json({ ok: true, alreadyCancelled: true });
  }

  await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, id));

  const startMs =
    row.scheduledAt instanceof Date ? row.scheduledAt.getTime() : Number(row.scheduledAt);
  const isFuture = startMs > Date.now();

  if (isFuture && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    // Pull organizer display info for a friendlier email subject — same
    // pattern as the booking-confirmation flow.
    const [organizer] = await db
      .select({
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        timezone: user.timezone,
      })
      .from(user)
      .where(eq(user.id, ctx.user.id));

    const handle = organizer?.displayName?.trim() || `@${organizer?.username ?? 'host'}`;
    const startStr = formatTimePair(
      startMs,
      { tz: organizer?.timezone || 'UTC', label: 'host' },
      null,
    );

    let html: string;
    let subject: string;
    if (intent === 'reschedule' && organizer?.username) {
      const rebookUrl = `https://acoffee.com/${encodeURIComponent(organizer.username)}`;
      html = renderVisitorRescheduleRequestHtml({
        hostHandle: handle,
        startStr,
        cafeName: row.placeName,
        cafeAddress: row.placeAddress,
        visitorName: row.visitorName,
        rebookUrl,
      });
      subject = `Coffee with ${handle} — let's reschedule`;
    } else {
      // Either explicit cancel or a reschedule request from a host who
      // doesn't have a username (so no /yourname link to send) —
      // fall back to the cancellation email.
      html = renderVisitorCancellationHtml({
        hostHandle: handle,
        startStr,
        cafeName: row.placeName,
        cafeAddress: row.placeAddress,
        visitorName: row.visitorName,
      });
      subject = `Coffee with ${handle} — cancelled`;
    }

    const resend = new Resend(env.RESEND_API_KEY);
    await Promise.allSettled([
      resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: row.visitorEmail,
        // Host cancelled — Reply-To = host so the visitor can ask
        // "everything ok? want to reschedule?" without bouncing off
        // a noreply.
        replyTo: organizer?.email,
        subject,
        html,
      }),
    ]);
  }

  return Response.json({ ok: true, intent });
};
