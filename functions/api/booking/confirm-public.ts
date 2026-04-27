import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookings, user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';
import { makeCancelToken, verifyConfirmToken } from '../../_lib/cancelToken';
import { buildIcs } from '../../_lib/booking';
import {
  formatTimePair,
  renderOrganizerConfirmationHtml,
  renderVisitorConfirmationHtml,
} from '../../_lib/bookingEmails';

/**
 * Visitor click-through: confirms the booking they just submitted, flips
 * status from 'unconfirmed' to 'pending', and fires both the organizer
 * notification and the visitor's calendar invite (with .ics attachments).
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
  cafeName: string;
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
      homeBaseAddress: user.homeBaseAddress,
    })
    .from(user)
    .where(eq(user.id, row.organizerUserId));

  const handle = organizer?.displayName?.trim() || `@${organizer?.username ?? 'host'}`;

  // Already-confirmed (status='pending') or cancelled — return what we
  // know but skip the side effects. The most common reason for a repeat
  // click is the visitor leaving the success page and re-opening their
  // email; double-firing the organizer notification would be confusing.
  if (row.status !== 'unconfirmed') {
    const resp: ConfirmResponse = {
      ok: true,
      alreadyConfirmed: row.status === 'pending',
      hostHandle: handle,
      startedAt: startMs,
      cafeName: row.placeName,
    };
    return Response.json(resp);
  }

  // Promote unconfirmed → pending. After this point the booking is real
  // and the slot is fully held against any future booking attempts.
  await db.update(bookings).set({ status: 'pending' }).where(eq(bookings.id, input.id));

  // Fire the post-confirm emails. ICS, organizer notification, visitor
  // invite-with-cancel-link — same pair as the old single-step flow.
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && organizer?.email) {
    const startStr = formatTimePair(
      startMs,
      { tz: organizer.timezone || 'UTC', label: 'host' },
      null,
    );
    const ics = buildIcs({
      uid: `${row.id}@acoffee.com`,
      startMs,
      durationMin: row.durationMinutes,
      summary: `Coffee with ${handle}`,
      description:
        `Auto-picked by ACoffee — midpoint between you both.\n\n` +
        `Café: ${row.placeName}\nAddress: ${row.placeAddress}\n`,
      location: `${row.placeName}, ${row.placeAddress}`,
      organizerEmail: organizer.email,
      attendeeEmail: row.visitorEmail,
    });
    const icsB64 = btoa(ics);

    const cancelToken = await makeCancelToken(env.AUTH_SECRET, row.id);
    const cancelUrl = `https://acoffee.com/booking/cancel?id=${encodeURIComponent(row.id)}&t=${encodeURIComponent(cancelToken)}`;

    const sharedConfirm = {
      startStr,
      cafeName: row.placeName,
      cafeAddress: row.placeAddress,
      // No googleMapsUri stored on the row — the place_id is enough to
      // build a maps link, but the email's "Open in Maps →" line uses
      // the URI form. Skipping for simplicity here; can be added later
      // if the missing line bothers anyone.
      cafeMaps: null,
      visitorName: row.visitorName,
      visitorEmail: row.visitorEmail,
      visitorAddress: row.visitorAddress,
      hostHandle: handle,
      hostHomeBase: organizer.homeBaseAddress ?? '',
    };

    const resend = new Resend(env.RESEND_API_KEY);
    await Promise.allSettled([
      resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: organizer.email,
        subject: `${row.visitorName} booked a coffee with you ☕`,
        html: renderOrganizerConfirmationHtml(sharedConfirm),
        attachments: [{ filename: 'coffee.ics', content: icsB64 }],
      }),
      resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: row.visitorEmail,
        subject: `Coffee with ${handle} confirmed ☕`,
        html: renderVisitorConfirmationHtml({ ...sharedConfirm, cancelUrl }),
        attachments: [{ filename: 'coffee.ics', content: icsB64 }],
      }),
    ]);
  }

  const resp: ConfirmResponse = {
    ok: true,
    hostHandle: handle,
    startedAt: startMs,
    cafeName: row.placeName,
  };
  return Response.json(resp);
};
