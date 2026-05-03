import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { bookings, user } from '../../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../../_lib/passport';
import { formatTimePair } from '../../../_lib/bookingEmails';

/**
 * Host rejects a `requested` booking. Optional `reason` body field gets
 * relayed to the visitor in the rejection email — most rejections will
 * be polite "can't this time, try another slot" so the visitor knows
 * to come back. Idempotent if already rejected.
 *
 * Status flips `requested` → `rejected`. The slot is freed (rejected
 * rows don't block other bookings), so the same visitor (or someone
 * else) can submit again for that time.
 */

const InputSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const ctx = await getSessionContext(env, request);
  if (!ctx) return jsonError('Unauthorized', 401);

  const id = typeof params.id === 'string' ? params.id : '';
  if (!id) return jsonError('Missing booking id', 400);

  let input: z.infer<typeof InputSchema> = {};
  try {
    // Body is optional — empty POST is fine for "no reason given".
    const text = await request.text();
    if (text.trim()) {
      input = InputSchema.parse(JSON.parse(text));
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.organizerUserId, ctx.user.id)));

  if (!row) return jsonError('Booking not found', 404);

  if (row.status === 'rejected') {
    return Response.json({ ok: true, alreadyRejected: true });
  }
  if (row.status !== 'requested') {
    return jsonError(
      `Cannot reject a ${row.status} booking — only 'requested' rows are pending host approval.`,
      409,
    );
  }

  await db.update(bookings).set({ status: 'rejected' }).where(eq(bookings.id, id));

  const startMs =
    row.scheduledAt instanceof Date ? row.scheduledAt.getTime() : Number(row.scheduledAt);

  // Polite rejection email. If the host gave a reason, surface it
  // verbatim. Either way nudge the visitor to try a different slot.
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    const [organizer] = await db
      .select({
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        timezone: user.timezone,
      })
      .from(user)
      .where(eq(user.id, ctx.user.id));

    if (organizer) {
      const handle = organizer.displayName?.trim() || `@${organizer.username ?? 'host'}`;
      const slug = organizer.username ?? '';
      const startStr = formatTimePair(
        startMs,
        { tz: organizer.timezone || 'UTC', label: 'host' },
        null,
      );
      const reasonBlock = input.reason
        ? `<div style="margin:18px 0;padding:14px 16px;background:#faf6f1;border-left:3px solid #6f4e37;border-radius:6px;">
             <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Their note</div>
             <div style="font-size:14px;color:#2c1810;line-height:1.5;white-space:pre-wrap;">${escapeHtml(input.reason)}</div>
           </div>`
        : '';
      const profileLink = slug
        ? `<p style="text-align:center;margin:0 0 18px;"><a href="https://acoffee.com/${encodeURIComponent(slug)}" style="display:inline-block;padding:0.7rem 1.4rem;background:#6f4e37;color:#fff;font-weight:600;border-radius:999px;text-decoration:none;">Pick another time →</a></p>`
        : '';
      const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 24px;box-shadow:0 1px 3px rgba(60,30,0,0.06);">
          <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">${escapeHtml(handle)} can't make it this time</h1>
          <p style="margin:0;color:#7a6a60;font-size:14px;">${escapeHtml(startStr)}</p>
          ${reasonBlock}
          <p style="margin:18px 0 14px;color:#5c4030;font-size:14px;line-height:1.5;">
            Hi ${escapeHtml(row.visitorName)} — thanks for reaching out. The slot you picked
            didn't work for ${escapeHtml(handle)}, but they'd still like to meet
            another time. Try another slot from their booking page.
          </p>
          ${profileLink}
        </div>
      </body></html>`;
      const resend = new Resend(env.RESEND_API_KEY);
      await Promise.allSettled([
        resend.emails.send({
          from: env.RESEND_FROM_EMAIL,
          to: row.visitorEmail,
          replyTo: organizer.email,
          subject: `${handle} can't make that coffee time`,
          html,
        }),
      ]);
    }
  }

  return Response.json({
    ok: true,
    booking: { id, status: 'rejected' as const },
  });
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
