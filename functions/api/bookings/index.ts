import { and, eq, ne } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { bookings } from '../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../_lib/passport';

/**
 * Lists bookings the signed-in user is organizing — used by the "My bookings"
 * page so the host can see who's coming, when, and where the auto-pick landed.
 * Visitor email + address are included because the organizer is the only
 * person who sees this view.
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const ctx = await getSessionContext(env, request);
  if (!ctx) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  // Hide unconfirmed bookings from the organizer — those are between the
  // visitor and the system until they click their confirmation link.
  // Showing them would surface "ghost" bookings that may never confirm
  // and add noise to the inbox.
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.organizerUserId, ctx.user.id),
        ne(bookings.status, 'unconfirmed'),
      ),
    );

  const wire = rows
    .map((r) => ({
      id: r.id,
      visitorName: r.visitorName,
      visitorEmail: r.visitorEmail,
      visitorAddress: r.visitorAddress,
      scheduledAt:
        r.scheduledAt instanceof Date ? r.scheduledAt.getTime() : Number(r.scheduledAt),
      durationMinutes: r.durationMinutes,
      placeId: r.placeId,
      placeName: r.placeName,
      placeAddress: r.placeAddress,
      placeLat: r.placeLat,
      placeLng: r.placeLng,
      status: r.status as 'pending' | 'cancelled',
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
    }))
    // Soonest upcoming first.
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  return Response.json({ bookings: wire });
};
