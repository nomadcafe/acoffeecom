/**
 * Edge cache for AI review summaries, keyed by placeId + locale so the same
 * café seen by different users only costs one Gemini call per region.
 *
 * Cache is per-colo; propagation isn't global but CF's popular-content routing
 * means a frequently-read key often hits the same tier-1 cache for nearby users.
 */

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function key(placeId: string, locale: string): Request {
  return new Request(
    `https://cache.internal/ai/summary/${encodeURIComponent(locale)}/${encodeURIComponent(placeId)}`,
    { method: 'GET' },
  );
}

export async function readSummaryCache(
  placeId: string,
  locale: string,
): Promise<string | null> {
  const hit = await caches.default.match(key(placeId, locale));
  if (!hit) return null;
  try {
    const body = (await hit.json()) as { summary?: unknown };
    return typeof body.summary === 'string' ? body.summary : null;
  } catch {
    return null;
  }
}

export function writeSummaryCache(
  placeId: string,
  locale: string,
  summary: string,
  waitUntil: (p: Promise<unknown>) => void,
): void {
  const response = Response.json(
    { summary },
    {
      headers: {
        'cache-control': `public, max-age=${TTL_SECONDS}, s-maxage=${TTL_SECONDS}`,
        'content-type': 'application/json',
      },
    },
  );
  waitUntil(caches.default.put(key(placeId, locale), response));
}
