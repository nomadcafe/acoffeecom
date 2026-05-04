/**
 * Fixed-window rate limit via Cloudflare's Cache API.
 *
 * Not globally consistent (cache is per-colo), so a very distributed attacker
 * could bypass by hitting multiple regions. That's fine for a small app — the
 * goal is to stop casual script abuse, not defend against a nation-state.
 *
 * No KV namespace / D1 binding required; the cache is free and automatic.
 */

interface Result {
  ok: boolean;
  count: number;
  limit: number;
  retryAfterSec: number;
}

export async function rateLimit(
  request: Request,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  opts: {
    bucket: string;
    limit: number;
    windowSec: number;
    /** Override the default IP-based key. Used for per-user / per-email
     *  rate limits (magic-link sign-in, recap-test) where IP-only would
     *  let the same email be mailbombed from rotating IPs. */
    keyOverride?: string;
  },
): Promise<Result> {
  const key =
    opts.keyOverride ??
    (request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown');

  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / opts.windowSec) * opts.windowSec;
  const cacheKey = new Request(
    `https://rl.internal/${opts.bucket}/${windowStart}/${encodeURIComponent(key)}`,
    { method: 'GET' },
  );

  const cached = await caches.default.match(cacheKey);
  const count = cached ? Number(await cached.text()) || 0 : 0;

  const retryAfterSec = windowStart + opts.windowSec - nowSec;
  if (count >= opts.limit) {
    return { ok: false, count, limit: opts.limit, retryAfterSec };
  }

  // Write the incremented counter; TTL covers the remainder of the window
  // plus a buffer so late reads still see the number.
  const putPromise = caches.default.put(
    cacheKey,
    new Response(String(count + 1), {
      headers: {
        'cache-control': `public, max-age=${opts.windowSec + 60}`,
        'content-type': 'text/plain',
      },
    }),
  );
  ctx.waitUntil(putPromise);

  return { ok: true, count: count + 1, limit: opts.limit, retryAfterSec };
}

export function rateLimitResponse(result: Result): Response {
  return Response.json(
    {
      error: 'Rate limit exceeded',
      limit: result.limit,
      retryAfterSec: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'retry-after': String(result.retryAfterSec),
        'access-control-allow-origin': '*',
      },
    },
  );
}
