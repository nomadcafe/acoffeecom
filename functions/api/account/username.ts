import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';

/**
 * Lowercase letters/digits/`_`/`-`, 3–30 chars, must start with a letter so a
 * pure-numeric `acoffee.com/123` doesn't end up looking like a placeholder.
 * Reserved words (api, account, passport, etc.) collide with our own routes
 * — block them at write time so the future `/yourname` surface stays safe.
 */
const USERNAME_REGEX = /^[a-z][a-z0-9_-]{2,29}$/;
const RESERVED = new Set([
  'account',
  'admin',
  'api',
  'app',
  'auth',
  'help',
  'login',
  'logout',
  'me',
  'passport',
  'pro',
  'settings',
  'signin',
  'signout',
  'signup',
  'support',
  'updates',
  'www',
]);

const InputSchema = z.object({
  username: z.string().nullable(),
});

export const onRequestPatch: PagesFunction<AuthEnv> = async ({ request, env }) => {
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

  if (value != null) {
    if (!USERNAME_REGEX.test(value)) {
      return jsonError('Invalid username format', 400);
    }
    if (RESERVED.has(value)) {
      return jsonError('Username reserved', 400);
    }

    const db = getDb(env);
    const [taken] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.username, value), ne(user.id, sessionUser.id)));
    if (taken) return jsonError('Username taken', 409);

    await db
      .update(user)
      .set({ username: value, updatedAt: new Date() })
      .where(eq(user.id, sessionUser.id));
  } else {
    const db = getDb(env);
    await db
      .update(user)
      .set({ username: null, updatedAt: new Date() })
      .where(eq(user.id, sessionUser.id));
  }

  return Response.json({ username: value });
};
