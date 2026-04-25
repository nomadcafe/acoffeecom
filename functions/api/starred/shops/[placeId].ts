import { and, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { starredShops } from '../../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../../_lib/passport';

/** Tombstone delete — see comment on visited-shops/[placeId].ts. */
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
    .from(starredShops)
    .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, placeId)));

  if (!prev) return new Response(null, { status: 204 });

  const prevMs = prev.updatedAt instanceof Date ? prev.updatedAt.getTime() : Number(prev.updatedAt);
  if (tsMs <= prevMs) return new Response(null, { status: 204 });

  await db
    .update(starredShops)
    .set({ deleted: true, updatedAt: new Date(tsMs) })
    .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, placeId)));

  return new Response(null, { status: 204 });
};
