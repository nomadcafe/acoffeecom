import { type AuthEnv } from '../../_lib/auth';
import { jsonError } from '../../_lib/passport';
import { runBookingGc } from '../../_lib/gc';

/**
 * Bearer-secured nightly garbage collector. Deletes:
 *   - unconfirmed bookings older than 24h (slot held but never confirmed)
 *   - booking_attempts older than 7d (rate-limit ledger past its window)
 *
 * Auth + invocation pattern mirrors /api/cron/monthly-recap: GitHub
 * Actions schedules a daily POST with `Authorization: Bearer
 * <CRON_SECRET>`. GET also accepted for browser-based testing.
 */
async function handle(env: AuthEnv, request: Request): Promise<Response> {
  if (!env.CRON_SECRET) {
    return jsonError('CRON_SECRET not configured', 500);
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return jsonError('Unauthorized', 401);
  }
  const result = await runBookingGc(env);
  return Response.json({ ok: true, ...result });
}

export const onRequestGet: PagesFunction<AuthEnv> = ({ env, request }) => handle(env, request);
export const onRequestPost: PagesFunction<AuthEnv> = ({ env, request }) => handle(env, request);
