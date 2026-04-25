import { and, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { visitedShops } from '../../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../../_lib/passport';

export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  const placeId = typeof params.placeId === 'string' ? params.placeId : null;
  if (!placeId) return jsonError('Missing placeId', 400);

  const db = getDb(env);
  await db
    .delete(visitedShops)
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, placeId)));

  return new Response(null, { status: 204 });
};
