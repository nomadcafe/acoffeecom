import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { starredShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { rowToWire } from '../../_lib/starred';

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  const rows = await db
    .select()
    .from(starredShops)
    .where(eq(starredShops.userId, user.id));

  return Response.json({ shops: rows.map(rowToWire) });
};
