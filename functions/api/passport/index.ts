import { and, eq, gt } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { visitedShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError, rowToWire } from '../../_lib/passport';

/**
 * Two modes:
 *  - No `?since`: return alive rows only. Used to bootstrap a fresh client.
 *  - `?since=<ms>`: delta — every row mutated after the cursor, including
 *    tombstones (deleted=true), so cross-device deletes propagate.
 *
 * Response includes `cursor` so the client can persist it for the next call.
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw != null ? Number(sinceRaw) : null;
  if (sinceRaw != null && (!Number.isFinite(since) || since! < 0)) {
    return jsonError('Invalid since', 400);
  }

  const db = getDb(env);
  const rows = since != null
    ? await db
        .select()
        .from(visitedShops)
        .where(and(eq(visitedShops.userId, user.id), gt(visitedShops.updatedAt, new Date(since))))
    : await db
        .select()
        .from(visitedShops)
        .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.deleted, false)));

  let cursor = since ?? 0;
  for (const r of rows) {
    const ms = r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt);
    if (ms > cursor) cursor = ms;
  }

  return Response.json({ shops: rows.map(rowToWire), cursor });
};
