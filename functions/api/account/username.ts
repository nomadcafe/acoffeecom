import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { checkUsernameAvailability } from '../../_lib/username';

/* Public username picker is open. Reserved-names policy (admin, coffee,
 * etc.) lives in `checkUsernameAvailability` as a block-list rather than
 * a flat feature flag so we can keep adding names without redeploys. */
const USERNAMES_PUBLIC = true;

const InputSchema = z.object({
  username: z.string().nullable(),
});

export const onRequestPatch: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!USERNAMES_PUBLIC) return jsonError('Username picker not yet available', 403);

  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const raw = input.username == null ? null : input.username.trim().toLowerCase();
  // Empty string → treat as clear (allow user to drop their username back to null).
  const value = raw === '' ? null : raw;

  const db = getDb(env);
  if (value != null) {
    const check = await checkUsernameAvailability(env, value, sessionUser.id);
    if (!check.available) {
      const status = check.reason === 'taken' ? 409 : 400;
      /* `reason` echoed to the client so the AccountPage form can show
       * the right copy — "reserved" gets a friendlier "contact us"
       * message rather than the generic "invalid format" line. */
      return Response.json(
        { error: `Username ${check.reason}`, reason: check.reason },
        { status },
      );
    }
    await db
      .update(user)
      .set({ username: value, updatedAt: new Date() })
      .where(eq(user.id, sessionUser.id));
  } else {
    await db
      .update(user)
      .set({ username: null, updatedAt: new Date() })
      .where(eq(user.id, sessionUser.id));
  }

  return Response.json({ username: value });
};

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!USERNAMES_PUBLIC) return jsonError('Username picker not yet available', 403);

  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const raw = (url.searchParams.get('value') ?? '').trim().toLowerCase();
  if (!raw) return jsonError('Missing value', 400);

  const result = await checkUsernameAvailability(env, raw, sessionUser.id);
  return Response.json(result);
};
