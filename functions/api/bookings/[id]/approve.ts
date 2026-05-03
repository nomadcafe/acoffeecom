import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import type { AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { bookings, user } from '../../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../../_lib/passport';
import {
  formatTimePair,
  renderVisitorConfirmationHtml,
} from '../../../_lib/bookingEmails';

/**
 * Host approves a `requested` booking. Body contains the café the host
 * picked in their /bookings approve modal — could be a venue from
 * Places autocomplete, the host's own featured cafés, or (later) an
 * AI-suggested midpoint between the visitor's address and the host's
 * home base. The endpoint just persists what the host chose; the
 * picker UI lives client-side.
 *
 * On success: status flips `requested` → `pending`, place_* fields are
 * filled, approved_at is set, and the visitor gets a "X said yes,
 * meet at <café>" email. Idempotent if already approved.
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
});

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
      approvedAt: now,
    })
    .where(eq(bookings.id, id));

  const startMs =
    row.scheduledAt instanceof Date ? row.scheduledAt.getTime() : Number(row.scheduledAt);

  // Email visitor: "X said yes! Meet at Y" with the café details.
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
        startMs,
        { tz: organizer.timezone || 'UTC', label: 'host' },
        null,
      );
      const resend = new Resend(env.RESEND_API_KEY);
      await Promise.allSettled([
        resend.emails.send({
          from: env.RESEND_FROM_EMAIL,
          to: row.visitorEmail,
          replyTo: organizer.email,
          subject: `${handle} said yes — coffee at ${input.placeName} ☕`,
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
      scheduledAt: startMs,
      durationMinutes: row.durationMinutes,
      placeId: input.placeId,
      placeName: input.placeName,
      placeAddress: input.placeAddress,
      placeLat: input.placeLat,
      placeLng: input.placeLng,
    },
  });
};
