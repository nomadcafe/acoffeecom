import { type AuthEnv } from '../../_lib/auth';
import { jsonError } from '../../_lib/passport';
import { runMonthlyRecap } from '../../_lib/monthlyRecap';

/**
 * Bearer-secured trigger for the once-a-month digest. Auth via
 * `Authorization: Bearer <CRON_SECRET>` header — the secret lives in the
 * Cloudflare dashboard (Pages → Settings → Environment Variables → CRON_SECRET).
 *
 * Pages Functions don't have native cron yet, so the practical setup is:
 *  - free option: cron-job.org or GitHub Actions hitting this URL on the 1st
 *    of every month with the bearer header
 *  - native option: a tiny separate Cloudflare Worker with a cron trigger
 *    that proxies into this URL with the same secret
 *
 * GET and POST both work — POST is preferred (matches the "side effect" verb)
 * but GET is allowed for browser-based testing.
 */
async function handle(env: AuthEnv, request: Request): Promise<Response> {
  if (!env.CRON_SECRET) {
    return jsonError('CRON_SECRET not configured', 500);
  }
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (auth !== expected) {
    return jsonError('Unauthorized', 401);
  }

  const result = await runMonthlyRecap(env);
  return Response.json({ ok: true, ...result });
}

export const onRequestGet: PagesFunction<AuthEnv> = ({ env, request }) => handle(env, request);
export const onRequestPost: PagesFunction<AuthEnv> = ({ env, request }) => handle(env, request);
