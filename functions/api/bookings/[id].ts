import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookings, user } from '../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../_lib/passport';

/**
 * Cancels a booking. Only the organizer can cancel. Future bookings get a
 * cancellation email out to the visitor; past ones are just marked
 * cancelled (no email — telling someone "your meeting last Tuesday was
 * cancelled" makes no sense).
 *
 * Idempotent: cancelling an already-cancelled booking returns 200, no email.
 */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const ctx = await getSessionContext(env, request);
  if (!ctx) return jsonError('Unauthorized', 401);

  const id = typeof params.id === 'string' ? params.id : '';
  if (!id) return jsonError('Missing booking id', 400);

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
      })
      .from(user)
      .where(eq(user.id, ctx.user.id));

    const handle = organizer?.displayName?.trim() || `@${organizer?.username ?? 'host'}`;
    const startStr = new Date(startMs).toUTCString();
    const html = renderCancelledHtml({
      handle,
      startStr,
      cafeName: row.placeName,
      cafeAddress: row.placeAddress,
      visitorName: row.visitorName,
    });
    const subject = `Coffee with ${handle} — cancelled`;
    const resend = new Resend(env.RESEND_API_KEY);
    await Promise.allSettled([
      resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: row.visitorEmail,
        subject,
        html,
      }),
    ]);
  }

  return Response.json({ ok: true });
};

function renderCancelledHtml(p: {
  handle: string;
  startStr: string;
  cafeName: string;
  cafeAddress: string;
  visitorName: string;
}): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#faf6f1;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px;">
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">Coffee with ${escape(p.handle)} — cancelled</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    <div style="margin:24px 0;padding:16px 18px;background:#faf6f1;border-radius:10px;">
      <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Was at</div>
      <div style="font-size:18px;font-weight:600;color:#2c1810;">${escape(p.cafeName)}</div>
      <div style="font-size:14px;color:#5c4030;margin-top:4px;">${escape(p.cafeAddress)}</div>
    </div>
    <p style="margin:0 0 8px;color:#5c4030;font-size:14px;line-height:1.5;">
      Hi ${escape(p.visitorName)} — ${escape(p.handle)} cancelled this coffee.
      Sorry about that. You can pick a new time on their profile when you're ready.
    </p>
    <p style="margin:24px 0 0;color:#a09080;font-size:12px;">
      Sent by <a href="https://acoffee.com/" style="color:#a36b3e;text-decoration:none;">ACoffee</a>.
    </p>
  </div>
</body></html>`;
}
