import { and, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { visitedShops } from '../../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../../_lib/passport';

/**
 * Soft-delete (tombstone) so an in-flight upsert from another offline device
 * can't resurrect the row via LWW. `?ts=<ms>` lets the client pass the
 * timestamp the user actually performed the delete at, which matters when
 * the delete sat in the offline queue for a while.
 */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  const placeId = typeof params.placeId === 'string' ? params.placeId : null;
  if (!placeId) return jsonError('Missing placeId', 400);

  const url = new URL(request.url);
  const tsRaw = url.searchParams.get('ts');
  const tsMs = tsRaw ? Number(tsRaw) : Date.now();
  if (!Number.isFinite(tsMs) || tsMs < 0) return jsonError('Invalid ts', 400);

  const db = getDb(env);
  const [prev] = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, placeId)));

  if (!prev) return new Response(null, { status: 204 });

  const prevMs = prev.updatedAt instanceof Date ? prev.updatedAt.getTime() : Number(prev.updatedAt);
  if (tsMs <= prevMs) return new Response(null, { status: 204 });

  await db
    .update(visitedShops)
    .set({ deleted: true, updatedAt: new Date(tsMs) })
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, placeId)));

  return new Response(null, { status: 204 });
};
