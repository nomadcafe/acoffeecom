import { and, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { session } from '../../../_lib/db/schema';
import { getSessionContext, jsonError } from '../../../_lib/passport';

/**
 * Revoke a single session row. The row must belong to the requesting user —
 * the WHERE clause guards against IDOR even if a malicious client guesses
 * another user's session id.
 *
 * Revoking the current session is allowed; the client is expected to clear
 * its cookie + redirect afterwards (the cookie itself isn't invalidated by
 * deleting the DB row, so subsequent requests will simply 401).
 */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const ctx = await getSessionContext(env, request);
  if (!ctx) return jsonError('Unauthorized', 401);

  const id = typeof params.id === 'string' ? params.id : null;
  if (!id) return jsonError('Missing session id', 400);

  const db = getDb(env);
  await db
    .delete(session)
    .where(and(eq(session.id, id), eq(session.userId, ctx.user.id)));

  return new Response(null, { status: 204 });
};
