import { and, eq, gt } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { starredShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { rowToWire } from '../../_lib/starred';

/** See passport/index.ts for the same `?since` cursor semantics. */
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
        .from(starredShops)
        .where(and(eq(starredShops.userId, user.id), gt(starredShops.updatedAt, new Date(since))))
    : await db
        .select()
        .from(starredShops)
        .where(and(eq(starredShops.userId, user.id), eq(starredShops.deleted, false)));

  let cursor = since ?? 0;
  for (const r of rows) {
    const ms = r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt);
    if (ms > cursor) cursor = ms;
  }

  return Response.json({ shops: rows.map(rowToWire), cursor });
};
