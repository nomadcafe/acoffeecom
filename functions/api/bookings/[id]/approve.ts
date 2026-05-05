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
import { makeCancelToken } from '../../../_lib/cancelToken';
import { buildBookingIcs, icsToBase64 } from '../../../_lib/ics';

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
   *  "Open in Maps" CTA in the visitor's confirmation email. zod's
   *  `.url()` accepts `javascript:` and `data:` schemes, which would
   *  end up as the href of an anchor in mail; an account-compromise
   *  vector. Restrict to https + a Google Maps host. */
  googleMapsUri: z
    .string()
    .url()
    .max(500)
    .refine(
      (v) => {
        try {
          const u = new URL(v);
          if (u.protocol !== 'https:') return false;
          const h = u.hostname.toLowerCase();
          // Exact match or any subdomain of google.com (covers
          // www.google.com, maps.google.com, etc).
          if (h === 'google.com' || h.endsWith('.google.com')) return true;
          // Goo.gl shortlink variants.
          if (h === 'goo.gl' || h === 'maps.app.goo.gl') return true;
          // Regional google ccTLDs: google.<2-3>(.<2-3>)? — e.g. google.fr,
          // google.co.uk, google.com.au. Anchored on both ends so a host
          // like `google.attacker.com` cannot match (the previous
          // `[a-z.]{2,}` allowed interior dots, which let any host whose
          // labels contain `google` followed by anything-with-dots
          // through). No leading subdomains permitted on the ccTLD case
          // — `subdomain.google.fr` is rare enough we don't bother.
          return /^google\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(h);
        } catch {
          return false;
        }
      },
      'googleMapsUri must be an https Google Maps URL',
    )
    .optional(),
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
      /* Cancel-link TTL: keep the link working for 24h past the meetup
       * so a no-show visitor can still send the courtesy cancellation
       * email after the fact. The state-machine guard on cancel-public
       * is a separate, independent check. */
      const cancelExpiresAt = finalMs + 24 * 60 * 60_000;
      const cancelToken = await makeCancelToken(env.AUTH_SECRET, id, cancelExpiresAt);
      const cancelUrl = `https://acoffee.com/booking/cancel?id=${encodeURIComponent(id)}&t=${encodeURIComponent(cancelToken)}`;
      /* Generate the ICS attachment so the visitor can one-click add
       * the meetup to Google / Apple / Outlook from their inbox. UID
       * is stable per booking id, so a future re-send (e.g. host
       * changes time later) updates the existing event in the
       * visitor's calendar instead of creating a duplicate. */
      const ics = buildBookingIcs({
        bookingId: id,
        startMs: finalMs,
        durationMinutes: row.durationMinutes,
        hostHandle: handle,
        hostEmail: organizer.email,
        visitorName: row.visitorName,
        visitorEmail: row.visitorEmail,
        cafeName: input.placeName,
        cafeAddress: input.placeAddress,
        visitorMessage: row.visitorMessage ?? null,
        googleMapsUri: input.googleMapsUri ?? null,
      });
      const resend = new Resend(env.RESEND_API_KEY);
      /* Approval notice — log on failure but the status flip already
       * committed. Visitor will see the approved booking next time
       * they open /bookings (or the host's /yourname page). */
      try {
        await resend.emails.send({
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
            cancelUrl,
          }),
          attachments: [
            {
              filename: 'coffee.ics',
              content: icsToBase64(ics),
              /* contentType not on Resend's Attachment shape — the
               * service infers from the .ics filename and serves
               * text/calendar with method=REQUEST so Gmail / Apple
               * Mail render the native "Add to calendar" UI. */
            },
          ],
        });
      } catch (e) {
        console.error('[booking-emails] approve notification send failed', {
          bookingId: id,
          to: row.visitorEmail,
          err: e instanceof Error ? e.message : String(e),
        });
      }
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
