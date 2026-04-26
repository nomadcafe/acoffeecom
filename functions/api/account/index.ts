import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';

/**
 * Hard-delete the signed-in user's account. FK constraints in schema.ts
 * cascade-clean session, account, visited_shops, starred_shops — verifying:
 *
 *   user.id ← session.user_id              (onDelete: cascade)
 *   user.id ← account.user_id              (onDelete: cascade)
 *   user.id ← visited_shops.user_id        (onDelete: cascade)
 *   user.id ← starred_shops.user_id        (onDelete: cascade)
 *
 * Caller must sign out client-side; the session row is gone but Better Auth's
 * cookie is still in the browser until cleared.
 */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  await db.delete(user).where(eq(user.id, sessionUser.id));

  return new Response(null, { status: 204 });
};
