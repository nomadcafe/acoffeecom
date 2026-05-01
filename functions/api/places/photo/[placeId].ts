import type { AuthEnv } from '../../../_lib/auth';
import { jsonError } from '../../../_lib/passport';
import { rateLimit, rateLimitResponse } from '../../../_lib/rateLimit';

/**
 * Public-profile place-photo proxy. Fronts Google's Places Photo API so
 * the browser never sees our Maps key, and caches every fetched image
 * in R2 keyed by place id. After first hit the steady-state cost is
 * zero — the redirect target lives forever (until manually purged) and
 * loads directly from CF's CDN.
 *
 * Flow per request:
 *   1. Validate place_id format (cheap defence against random spam).
 *   2. Per-IP rate limit. Generous because real profile pages can fan
 *      out to ~5 photos at once.
 *   3. Look up KV cache `place_photo:{placeId}`:
 *        - hit "NO_PHOTO" → 404, browser shows fallback gradient.
 *        - hit r2_key   → 302 to the R2 public URL.
 *        - miss          → fall through.
 *   4. On miss, ask Places Place Details for the first `photos[].name`,
 *      then GET the photo bytes via Places Photo media endpoint.
 *   5. Write bytes to R2 at `places/{placeId}.jpg`, KV-cache the key
 *      for 30 days, 302 to the R2 public URL.
 *
 * Cost shape: ~$0.024 per cache miss (Place Details + Photo media on
 * the Places Pro tier). Cache TTL of 30 days means a popular profile's
 * top shops cost <$0.10 / month total.
 */

const PLACE_ID_RE = /^[A-Za-z0-9_-]{20,200}$/;
const KV_PREFIX = 'place_photo:';
const KV_TTL_S = 60 * 60 * 24 * 30; // 30 days
const NO_PHOTO_MARKER = 'NO_PHOTO';
const R2_CACHE_CONTROL = 'public, max-age=2592000, immutable';
const PHOTO_MAX_WIDTH = 200;

function buildPublicUrl(env: AuthEnv, key: string): string | null {
  if (!env.PLACE_PHOTOS_PUBLIC_URL) return null;
  return `${env.PLACE_PHOTOS_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
}

function r2KeyFor(placeId: string): string {
  return `places/${placeId}.jpg`;
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ params, request, env, waitUntil }) => {
  const placeId = typeof params.placeId === 'string' ? params.placeId : '';
  if (!PLACE_ID_RE.test(placeId)) return jsonError('Invalid place id', 400);

  if (!env.PLACE_PHOTOS || !env.PLACE_PHOTOS_PUBLIC_URL) {
    return jsonError('Place photo cache is not configured', 503);
  }

  // 60 photos per minute per IP — covers a normal profile page (5 photos)
  // even on rapid back-and-forth navigation, but caps a script burning
  // through random place_ids on cache misses.
  const rl = await rateLimit(
    request,
    { waitUntil },
    { bucket: 'place-photo', limit: 60, windowSec: 60 },
  );
  if (!rl.ok) return rateLimitResponse(rl);

  const kv = env.ROUTES_CACHE;
  const cacheKey = `${KV_PREFIX}${placeId}`;

  // Fast path: known mapping in KV.
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached === NO_PHOTO_MARKER) {
      return new Response(null, {
        status: 404,
        headers: { 'cache-control': 'public, max-age=86400' },
      });
    }
    if (cached) {
      const url = buildPublicUrl(env, cached);
      if (url) return Response.redirect(url, 302);
    }
  }

  // Slow path: pull from Google.
  const apiKey = env.GOOGLE_MAPS_SERVER_KEY ?? env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return jsonError('Google Maps key not configured', 503);

  // Step 1: Place Details with the photos field mask. We only need
  // photos[0].name — Google charges per request not per field.
  let photoName: string | null = null;
  try {
    const detailsRes = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'photos',
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (detailsRes.ok) {
      const data = (await detailsRes.json()) as { photos?: Array<{ name?: string }> };
      photoName = data.photos?.[0]?.name ?? null;
    }
  } catch {
    // Network error or timeout — treat as no photo, will retry after KV TTL.
  }

  if (!photoName) {
    if (kv) {
      waitUntil(
        kv.put(cacheKey, NO_PHOTO_MARKER, { expirationTtl: KV_TTL_S }),
      );
    }
    return new Response(null, {
      status: 404,
      headers: { 'cache-control': 'public, max-age=86400' },
    });
  }

  // Step 2: fetch the actual image bytes.
  let bytes: ArrayBuffer | null = null;
  try {
    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&key=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (photoRes.ok) {
      bytes = await photoRes.arrayBuffer();
    }
  } catch {
    /* fall through to error response below */
  }

  if (!bytes || bytes.byteLength === 0) {
    if (kv) {
      waitUntil(
        kv.put(cacheKey, NO_PHOTO_MARKER, { expirationTtl: KV_TTL_S }),
      );
    }
    return new Response(null, { status: 502 });
  }

  // Step 3: persist to R2 + KV.
  const key = r2KeyFor(placeId);
  await env.PLACE_PHOTOS.put(key, bytes, {
    httpMetadata: { contentType: 'image/jpeg', cacheControl: R2_CACHE_CONTROL },
  });
  if (kv) {
    waitUntil(kv.put(cacheKey, key, { expirationTtl: KV_TTL_S }));
  }

  const url = buildPublicUrl(env, key);
  if (!url) return jsonError('Place photo public URL missing', 500);
  return Response.redirect(url, 302);
};
