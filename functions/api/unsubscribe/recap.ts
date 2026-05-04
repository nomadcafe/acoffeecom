/**
 * One-click unsubscribe for the monthly recap email. Linked from the
 * `List-Unsubscribe` + `List-Unsubscribe-Post` headers Resend ships with
 * each recap so Gmail / Apple Mail / etc. can present a native
 * "Unsubscribe" button next to the message and POST here when clicked.
 *
 * RFC 8058: must accept a POST with `List-Unsubscribe=One-Click` body
 * and return 2xx within a reasonable time. Token has no expiry — RFC
 * mandates unsubscribe links keep working — the action is idempotent
 * (sets monthlyRecapEmail=false) and the user can re-opt-in via
 * /account, so replay is harmless.
 *
 * Also handles GET so that pasting the URL into a browser yields a
 * confirmation page rather than a method-not-allowed error.
 */

import { eq } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';
import { verifyUnsubToken } from '../../_lib/unsubToken';

async function unsubscribe(env: AuthEnv, userId: string, token: string): Promise<Response> {
  const ok = await verifyUnsubToken(env.AUTH_SECRET, 'recap', userId, token);
  if (!ok) return jsonError('Invalid unsubscribe link', 403);
  const db = getDb(env);
  await db
    .update(user)
    .set({ monthlyRecapEmail: false, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Unsubscribed — ACoffee</title>` +
      `<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#faf7f2;color:#2c1810;padding:48px 24px;text-align:center;}h1{font-family:Fraunces,Georgia,serif;font-size:1.6rem;margin:0 0 12px;}p{color:#6b5848;line-height:1.55;}</style>` +
      `<h1>You're unsubscribed ☕</h1>` +
      `<p>Monthly recap emails are off. You can turn them back on anytime from <a href="https://acoffee.com/account" style="color:#a36b3e;">/account</a>.</p>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u') ?? '';
  const token = url.searchParams.get('t') ?? '';
  if (!userId || !token) return jsonError('Missing unsubscribe parameters', 400);
  return unsubscribe(env, userId, token);
};

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u') ?? '';
  const token = url.searchParams.get('t') ?? '';
  if (!userId || !token) return jsonError('Missing unsubscribe parameters', 400);
  return unsubscribe(env, userId, token);
};
