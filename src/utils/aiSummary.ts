import type { Locale } from '../i18n/messages';

type CachedSummary = { summary: string; v: 1 };

function cacheKey(placeId: string, locale: Locale): string {
  return `ac:ai-summary:${locale}:${placeId}`;
}

export function getCachedSummary(placeId: string, locale: Locale): string | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(placeId, locale));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSummary;
    return typeof parsed.summary === 'string' ? parsed.summary : null;
  } catch {
    return null;
  }
}

function setCachedSummary(placeId: string, locale: Locale, summary: string) {
  try {
    sessionStorage.setItem(cacheKey(placeId, locale), JSON.stringify({ summary, v: 1 }));
  } catch {
    // Quota or disabled — ignore, we just won't cache.
  }
}

/**
 * Fetch reviews via Places API (New) and summarize them through the backend.
 * Throws if reviews are unavailable (empty or Places failed); caller should
 * surface the empty case as a friendly message.
 *
 * Pass `signal` to cancel the summarize fetch. The Places `fetchFields` call
 * can't be aborted (no SDK support), but we short-circuit after it resolves
 * so state never updates on an unmounted card.
 *
 * On HTTP 429 throws `RATE_LIMITED:<retryAfterSec>` so the caller can show
 * a specific cooldown message instead of a generic error.
 */
export async function fetchAiSummary(
  placeId: string,
  placeName: string,
  locale: Locale,
  signal?: AbortSignal,
): Promise<string> {
  const cached = getCachedSummary(placeId, locale);
  if (cached) return cached;

  const lib = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  const place = new lib.Place({ id: placeId });
  await place.fetchFields({ fields: ['reviews'] });
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const rawReviews = place.reviews ?? [];
  const reviews = rawReviews
    .map((r) => ({
      text: (r.text ?? '').trim(),
      rating: typeof r.rating === 'number' ? r.rating : undefined,
    }))
    .filter((r) => r.text.length > 0)
    .slice(0, 8);

  if (reviews.length === 0) {
    throw new Error('NO_REVIEWS');
  }

  const res = await fetch('/api/ai/summarize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ placeId, placeName, reviews, locale }),
    signal,
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || 60;
    throw new Error(`RATE_LIMITED:${retryAfter}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }
  const data = (await res.json()) as { summary?: string };
  if (!data.summary) throw new Error('BAD_RESPONSE');

  setCachedSummary(placeId, locale, data.summary);
  return data.summary;
}
