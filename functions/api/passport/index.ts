import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { visitedShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError, rowToWire } from '../../_lib/passport';

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  const rows = await db
    .select()
    .from(visitedShops)
    .where(eq(visitedShops.userId, user.id));

  return Response.json({ shops: rows.map(rowToWire) });
};
