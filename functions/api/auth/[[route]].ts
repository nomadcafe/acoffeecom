import { createAuth, type AuthEnv } from '../../_lib/auth';
import { rateLimit, rateLimitResponse } from '../../_lib/rateLimit';

// Catchall — Better Auth owns every /api/auth/* path, including magic-link
// send / verify / get-session / sign-out. Adding individual routes alongside
// this file would shadow the auth handler and break those flows.
//
// Pre-flight: rate-limit the magic-link send endpoint before it reaches
// Better Auth. Better Auth has a built-in rate limit but defaults to memory
// storage, which on CF Pages is per-isolate — trivial to bypass by routing
// to different isolates. Our cache-based limiter is per-colo across all
// isolates in a colo, which is meaningfully harder to bypass for
// mail-bombing attacks.
export const onRequest: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);

  if (
    request.method === 'POST' &&
    (url.pathname === '/api/auth/sign-in/magic-link' ||
      url.pathname.endsWith('/sign-in/magic-link'))
  ) {
    /* Per-IP cap — covers anonymous probing attacks. 5 sign-in requests
     * in 10 minutes is plenty for a real human (one for typo recovery,
     * one for the actual send; rest is buffer). */
    const ipResult = await rateLimit(
      request,
      { waitUntil },
      { bucket: 'auth-ml-ip', limit: 5, windowSec: 600 },
    );
    if (!ipResult.ok) return rateLimitResponse(ipResult);

    /* Per-email cap — protects a specific inbox from a rotating-IP
     * attacker. We have to peek at the body to read the email; clone
     * first so Better Auth's handler still has a fresh body to parse. */
    try {
      const body = (await request.clone().json()) as { email?: unknown };
      if (typeof body.email === 'string' && body.email.length > 0) {
        const emailKey = body.email.toLowerCase().trim();
        const emailResult = await rateLimit(
          request,
          { waitUntil },
          {
            bucket: 'auth-ml-email',
            limit: 3,
            windowSec: 3600,
            keyOverride: emailKey,
          },
        );
        if (!emailResult.ok) return rateLimitResponse(emailResult);
      }
    } catch {
      /* Malformed body — let Better Auth respond with its own 400. */
    }
  }

  const auth = createAuth(env);
  return auth.handler(request);
};
