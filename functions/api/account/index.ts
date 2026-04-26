import { z } from 'zod';
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

const PatchSchema = z.object({
  profilePublic: z.boolean().optional(),
  monthlyRecapEmail: z.boolean().optional(),
});

/** Patch toggles for the user account. Currently `profilePublic` (whether
 *  acoffee.com/<username> is reachable) and `monthlyRecapEmail` (the once-
 *  a-month digest). Profile publish requires a username to exist already
 *  — there'd be no URL to host the page at otherwise. */
export const onRequestPatch: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  let input: z.infer<typeof PatchSchema>;
  try {
    input = PatchSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);
  if (input.profilePublic === true) {
    const [row] = await db
      .select({ username: user.username })
      .from(user)
      .where(eq(user.id, sessionUser.id));
    if (!row?.username) return jsonError('Set a username before publishing', 400);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.profilePublic !== undefined) patch.profilePublic = input.profilePublic;
  if (input.monthlyRecapEmail !== undefined) patch.monthlyRecapEmail = input.monthlyRecapEmail;

  if (Object.keys(patch).length > 1) {
    await db
      .update(user)
      .set(patch)
      .where(eq(user.id, sessionUser.id));
  }

  return Response.json({ ok: true });
};
