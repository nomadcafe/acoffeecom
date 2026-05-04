import { type AuthEnv } from '../../_lib/auth';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { lastThirtyDaysRange, sendRecapForUser } from '../../_lib/monthlyRecap';
import { rateLimit, rateLimitResponse } from '../../_lib/rateLimit';

/**
 * Send a one-off recap email to the signed-in user using a rolling 30-day
 * window — preview-of-the-real-thing for QA + trust ("yes, this is what
 * I'd actually receive on the 1st").
 *
 * Bypasses the monthlyRecapEmail toggle on purpose: a user explicitly
 * asking for a sample shouldn't be blocked by their own preference. Still
 * obeys the 'cups > 0' check inside sendRecapForUser, so a brand-new user
 * with no visits gets a 'skipped' response rather than an empty email.
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);
  if (!sessionUser.email) return jsonError('No email on session', 400);

  /* Per-user cooldown. Without this, a hostile (or just curious) signed-in
   * user can hammer this endpoint to burn Resend quota / damage the
   * sender domain reputation. 3 sends per hour is plenty for QA — the
   * cap is keyed on userId, not IP, so the same person on a different
   * network still gets throttled. */
  const result = await rateLimit(
    request,
    { waitUntil },
    {
      bucket: 'recap-test',
      limit: 3,
      windowSec: 3600,
      keyOverride: sessionUser.id,
    },
  );
  if (!result.ok) return rateLimitResponse(result);

  const outcome = await sendRecapForUser(
    env,
    { id: sessionUser.id, email: sessionUser.email },
    lastThirtyDaysRange(),
  );
  return Response.json({ ok: true, outcome });
};
