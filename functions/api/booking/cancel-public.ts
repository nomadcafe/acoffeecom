import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookings, user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';
import { verifyCancelToken } from '../../_lib/cancelToken';
import {
  formatTimePair,
  renderOrganizerCancellationHtml,
} from '../../_lib/bookingEmails';

/**
 * Visitor-initiated cancellation. The cancel link in the visitor's
 * confirmation email is `/booking/cancel?id=<id>&t=<token>`; the page
 * POSTs here with `{id, token}`. We verify the HMAC, mark the row
 * cancelled (idempotent), and email the organizer.
 *
 * No auth — that's the point. Anyone with a valid (booking id, token)
 * pair can cancel, which matches "received the visitor's email" since the
 * link is single-use-like by virtue of being mailed only to the visitor.
 */

const InputSchema = z.object({
  id: z.string().uuid(),
  token: z.string().min(8).max(120),
});

interface CancelResponse {
  ok: true;
  alreadyCancelled?: boolean;
  /** Echoed for the success page so the visitor sees what they cancelled. */
  hostHandle: string;
  startedAt: number;
  /** Null while the booking is in unconfirmed/requested — no café picked
   *  yet (host approval is what materialises the café choice). Frontend
   *  must guard for null instead of rendering "null" literally. */
  cafeName: string | null;
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const ok = await verifyCancelToken(env.AUTH_SECRET, input.id, input.token);
  if (!ok) return jsonError('Invalid cancellation link', 403);

  const db = getDb(env);
  const [row] = await db.select().from(bookings).where(eq(bookings.id, input.id));
  if (!row) return jsonError('Booking not found', 404);

  const startMs =
    row.scheduledAt instanceof Date ? row.scheduledAt.getTime() : Number(row.scheduledAt);

  // Need organizer info for the response + email — fetch in parallel.
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

  if (row.status === 'cancelled') {
    const resp: CancelResponse = {
      ok: true,
      alreadyCancelled: true,
      hostHandle: handle,
      startedAt: startMs,
      cafeName: row.placeName,
    };
    return Response.json(resp);
  }

  // State guard. Visitor cancellation is only meaningful while the booking
  // is in flight — once the host has actively rejected it, the visitor
  // re-clicking the cancel link must NOT silently flip the row to
  // cancelled (and trigger an organizer email saying "X cancelled" when
  // the host was the one who closed it). 'rejected' is terminal from the
  // visitor's side; surface it instead of overwriting.
  const cancellable: ReadonlyArray<typeof row.status> = ['unconfirmed', 'requested', 'pending'];
  if (!cancellable.includes(row.status)) {
    return jsonError(`This booking can no longer be cancelled (status: ${row.status})`, 409);
  }

  // Cancelling an unconfirmed (visitor never clicked confirm) doesn't
  // notify the organizer — they were never told about this booking in
  // the first place. Just flip status, return ok.
  const wasUnconfirmed = row.status === 'unconfirmed';
  await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, input.id));

  // Notify organizer when there's still time on the calendar — past
  // bookings get the silent treatment same as the organizer-side cancel.
  // Skip when the row was unconfirmed (organizer never knew it existed).
  if (
    !wasUnconfirmed &&
    startMs > Date.now() &&
    env.RESEND_API_KEY &&
    env.RESEND_FROM_EMAIL &&
    organizer?.email
  ) {
    const startStr = formatTimePair(
      startMs,
      { tz: organizer.timezone || 'UTC', label: 'host' },
      null,
    );
    const html = renderOrganizerCancellationHtml({
      hostHandle: handle,
      visitorName: row.visitorName,
      startStr,
      cafeName: row.placeName,
      cafeAddress: row.placeAddress,
    });
    const resend = new Resend(env.RESEND_API_KEY);
    await Promise.allSettled([
      resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: organizer.email,
        // Visitor is the one who cancelled — set Reply-To to them so the
        // host can write back ("ah no worries, want to reschedule?").
        replyTo: row.visitorEmail,
        subject: `${row.visitorName} cancelled their coffee`,
        html,
      }),
    ]);
  }

  const resp: CancelResponse = {
    ok: true,
    hostHandle: handle,
    startedAt: startMs,
    cafeName: row.placeName,
  };
  return Response.json(resp);
};
