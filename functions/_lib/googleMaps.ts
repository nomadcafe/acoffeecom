import type { AuthEnv } from './auth';

/**
 * Server-side wrappers around the Google Maps REST APIs we need for the
 * booking flow. Web client uses `@react-google-maps/api`; that doesn't run
 * on Workers, so booking endpoints (which can't trust client-supplied
 * coordinates anyway) call the REST endpoints directly with a server key.
 *
 * No retry / no SDK — these are simple fetches with structured errors.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export class GoogleMapsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly source: 'config' | 'geocode' | 'places' | 'network',
  ) {
    super(message);
    this.name = 'GoogleMapsError';
  }
}

/* Prefer the dedicated server key but fall back to the client one — both
 * are configured in the Pages dashboard and the client one is already there
 * for the SPA. Separate-key hardening can come later. */
function requireKey(env: AuthEnv): string {
  const key = env.GOOGLE_MAPS_SERVER_KEY || env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new GoogleMapsError(
      'No Google Maps API key configured (GOOGLE_MAPS_SERVER_KEY or VITE_GOOGLE_MAPS_API_KEY)',
      500,
      'config',
    );
  }
  return key;
}

/**
 * Geocode a free-form address string. Returns the top result's lat/lng.
 * Throws on no-results or non-OK responses so callers can map the error
 * to a user-facing "couldn't find that address" message.
 */
export async function geocodeAddress(env: AuthEnv, address: string): Promise<LatLng> {
  const key = requireKey(env);
  const trimmed = address.trim();
  if (!trimmed) throw new GoogleMapsError('Empty address', 400, 'geocode');

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', trimmed);
  url.searchParams.set('key', key);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    throw new GoogleMapsError(
      `Geocoding network error: ${e instanceof Error ? e.message : String(e)}`,
      502,
      'network',
    );
  }
  if (!res.ok) {
    throw new GoogleMapsError(
      `Geocoding HTTP ${res.status}`,
      res.status >= 500 ? 502 : 400,
      'geocode',
    );
  }
  const json = (await res.json()) as {
    status?: string;
    results?: { geometry?: { location?: LatLng } }[];
    error_message?: string;
  };
  if (json.status !== 'OK' || !json.results || json.results.length === 0) {
    throw new GoogleMapsError(
      json.error_message || `Geocoding failed: ${json.status ?? 'unknown'}`,
      json.status === 'ZERO_RESULTS' ? 404 : 502,
      'geocode',
    );
  }
  const loc = json.results[0]?.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    throw new GoogleMapsError('Geocoding returned no coordinates', 502, 'geocode');
  }
  return { lat: loc.lat, lng: loc.lng };
}

/** Geographic midpoint between two points — flat-earth average is fine for
 *  the distances coffee meetups span (≤30 km typical). For longer hauls a
 *  great-circle midpoint would matter, but those aren't real meetups. */
export function midpointOf(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * Great-circle distance between two points in kilometres (haversine).
 * Used to short-circuit nonsensical bookings where the addresses are
 * on opposite continents — picking a "midpoint" café between Tokyo and
 * New York lands you in the middle of the Pacific where no Place
 * exists, which the old code surfaced to the visitor as a generic 404.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearbyCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingsTotal: number | null;
  googleMapsUri: string | null;
}

/**
 * Search the Places (New) API for highly-rated cafés near `center`. Returns
 * up to `limit` candidates sorted by Google's relevance — caller can apply
 * its own ranking (rating threshold etc). 404 / empty result returns [].
 */
export async function searchNearbyCafes(
  env: AuthEnv,
  center: LatLng,
  radiusMeters: number = 1500,
  limit: number = 10,
): Promise<NearbyCafe[]> {
  const key = requireKey(env);

  const body = {
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: Math.max(100, Math.min(radiusMeters, 50_000)),
      },
    },
    includedPrimaryTypes: ['cafe'],
    maxResultCount: Math.max(1, Math.min(limit, 20)),
    rankPreference: 'DISTANCE',
  };

  let res: Response;
  try {
    res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GoogleMapsError(
      `Places network error: ${e instanceof Error ? e.message : String(e)}`,
      502,
      'network',
    );
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new GoogleMapsError(`Places HTTP ${res.status}: ${txt}`, 502, 'places');
  }
  const json = (await res.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      rating?: number;
      userRatingCount?: number;
      googleMapsUri?: string;
    }>;
  };
  return (json.places ?? [])
    .map((p) => {
      const id = p.id;
      const name = p.displayName?.text;
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (!id || !name || typeof lat !== 'number' || typeof lng !== 'number') return null;
      return {
        placeId: id,
        name,
        address: p.formattedAddress ?? '',
        lat,
        lng,
        rating: typeof p.rating === 'number' ? p.rating : null,
        userRatingsTotal: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
        googleMapsUri: p.googleMapsUri ?? null,
      } as NearbyCafe;
    })
    .filter((c): c is NearbyCafe => c != null);
}

/**
 * Look up the IANA timezone for a lat/lng using Google's Time Zone API.
 * Used by /api/account PATCH to derive a correct timezone from the
 * organizer's home base, so "Mon 14:00-17:00" means 2-5pm in the city
 * the meetup actually happens, regardless of what timezone the
 * organizer's browser is in.
 */
export async function lookupTimezone(env: AuthEnv, point: LatLng): Promise<string> {
  const key = requireKey(env);
  const url = new URL('https://maps.googleapis.com/maps/api/timezone/json');
  url.searchParams.set('location', `${point.lat},${point.lng}`);
  // The API needs a reference timestamp to disambiguate DST; current time
  // is fine — we want "the timezone in effect at this point right now."
  url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set('key', key);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    throw new GoogleMapsError(
      `Time Zone network error: ${e instanceof Error ? e.message : String(e)}`,
      502,
      'network',
    );
  }
  if (!res.ok) {
    throw new GoogleMapsError(`Time Zone HTTP ${res.status}`, 502, 'geocode');
  }
  const json = (await res.json()) as { status?: string; timeZoneId?: string; errorMessage?: string };
  if (json.status !== 'OK' || !json.timeZoneId) {
    throw new GoogleMapsError(
      json.errorMessage || `Time Zone failed: ${json.status ?? 'unknown'}`,
      502,
      'geocode',
    );
  }
  return json.timeZoneId;
}

export type TravelMode = 'TRANSIT' | 'WALK' | 'DRIVE';

/**
 * Travel-time matrix via Google Routes API v2 (`computeRouteMatrix`).
 * Returns durations in seconds, indexed `[originIndex][destinationIndex]`.
 * Unreachable cells (no transit route, etc.) come back as `null` so
 * callers can fall back to distance-based fairness for those rows.
 *
 * Why this matters: the geographic midpoint can be a 3-line transit
 * trip for one party and a one-stop direct for the other — which feels
 * "fair" on a map but isn't fair in lived minutes. Surfacing real ETAs
 * is what makes the agent product different from a Google Maps filter.
 *
 * Cost: ~$5/1000 elements at 2026 pricing. 5 candidates × 3 parties =
 * 15 elements/search ≈ $0.075. Acceptable at small scale.
 */
/** TTL for cached Routes results — long enough that filter changes
 *  within a session don't pay twice, short enough that transit
 *  schedule changes (peak vs off-peak) don't get stale for too long. */
const ROUTES_CACHE_TTL_S = 3600;

/** Round lat/lng to ~10m precision before hashing into the cache key.
 *  Two visitors typing the same address geocode to slightly different
 *  coordinates (4–5 decimals); this collapses them so the cache hits. */
function roundForCache(p: LatLng): { lat: number; lng: number } {
  return { lat: Math.round(p.lat * 10000) / 10000, lng: Math.round(p.lng * 10000) / 10000 };
}

function pairKey(origin: LatLng, dest: LatLng, mode: TravelMode): string {
  const o = roundForCache(origin);
  const d = roundForCache(dest);
  return `eta:${mode}:${o.lat},${o.lng}:${d.lat},${d.lng}`;
}

/** Per-pair lookup against KV. Returns parallel arrays: cached values
 *  (null = miss), and the indices that need a network fetch. */
async function loadCachedPairs(
  cache: KVNamespace,
  origins: LatLng[],
  destinations: LatLng[],
  mode: TravelMode,
): Promise<{
  cached: (number | null | 'miss')[][];
  missCount: number;
}> {
  const cached: (number | null | 'miss')[][] = origins.map(() =>
    destinations.map(() => 'miss' as const),
  );
  let missCount = 0;
  // Fan out the reads — KV is fast individually, but doing all pairs in
  // parallel beats N sequential awaits when N is 15-40.
  const lookups: Array<Promise<void>> = [];
  for (let i = 0; i < origins.length; i++) {
    for (let j = 0; j < destinations.length; j++) {
      const k = pairKey(origins[i], destinations[j], mode);
      lookups.push(
        cache.get(k).then((raw) => {
          if (raw == null) {
            missCount++;
            return;
          }
          // Stored as a number-or-null marker. "null" means we cached an
          // unreachable pair (no transit route) so we don't pay for it
          // again on retry within the TTL.
          if (raw === 'null') {
            cached[i][j] = null;
          } else {
            const n = Number(raw);
            cached[i][j] = Number.isFinite(n) ? n : null;
          }
        }),
      );
    }
  }
  await Promise.all(lookups);
  return { cached, missCount };
}

async function persistPair(
  cache: KVNamespace,
  origin: LatLng,
  dest: LatLng,
  mode: TravelMode,
  value: number | null,
): Promise<void> {
  const k = pairKey(origin, dest, mode);
  await cache.put(k, value === null ? 'null' : String(value), {
    expirationTtl: ROUTES_CACHE_TTL_S,
  });
}

export async function computeRouteMatrix(
  env: AuthEnv,
  origins: LatLng[],
  destinations: LatLng[],
  mode: TravelMode = 'TRANSIT',
): Promise<(number | null)[][]> {
  if (origins.length === 0 || destinations.length === 0) return [];

  // ----- Cache lookup pass -----
  let cached: (number | null | 'miss')[][] | null = null;
  if (env.ROUTES_CACHE) {
    const lookup = await loadCachedPairs(env.ROUTES_CACHE, origins, destinations, mode);
    cached = lookup.cached;
    // All hit → no network call needed at all.
    if (lookup.missCount === 0) {
      return cached.map((row) =>
        row.map((c) => (c === 'miss' ? null : (c as number | null))),
      );
    }
  }

  // Build a Routes request only for the missing cells. We still send
  // the full origins/destinations arrays (Routes is per-element priced;
  // the API doesn't let us cherry-pick pairs) but if the cache covered
  // everything we'd have returned above. So the savings come from not
  // hitting Routes at all on full-cache-hit searches.
  const key = requireKey(env);

  const body = {
    origins: origins.map((o) => ({
      waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
    })),
    destinations: destinations.map((d) => ({
      waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
    })),
    travelMode: mode,
    // routing_preference is only valid for DRIVE. TRANSIT/WALK reject it.
    ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
  };

  let res: Response;
  try {
    res = await fetch(
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'originIndex,destinationIndex,duration,condition,status',
        },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    throw new GoogleMapsError(
      `Routes network error: ${e instanceof Error ? e.message : String(e)}`,
      502,
      'network',
    );
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new GoogleMapsError(`Routes HTTP ${res.status}: ${txt}`, 502, 'places');
  }
  const elements = (await res.json()) as Array<{
    originIndex?: number;
    destinationIndex?: number;
    duration?: string;
    condition?: 'ROUTE_EXISTS' | 'ROUTE_NOT_FOUND' | string;
    status?: { code?: number };
  }>;

  // Initialize matrix with null (= unreachable / unknown). Routes API
  // returns elements in arbitrary order; index in to populate.
  const matrix: (number | null)[][] = origins.map(() =>
    destinations.map(() => null),
  );
  for (const el of elements) {
    if (
      typeof el.originIndex !== 'number' ||
      typeof el.destinationIndex !== 'number'
    )
      continue;
    if (el.condition !== 'ROUTE_EXISTS') continue;
    // duration is ISO-8601 like "1234s" — strip the trailing 's' and parse.
    const raw = el.duration?.endsWith('s') ? el.duration.slice(0, -1) : el.duration;
    const seconds = raw ? Number(raw) : NaN;
    if (Number.isFinite(seconds)) {
      matrix[el.originIndex][el.destinationIndex] = seconds;
    }
  }

  // Cache writes: every pair we just computed (including unreachable
  // null cells — caching the negative result avoids re-paying on retry).
  // Fire-and-forget — caching failures shouldn't block the response.
  if (env.ROUTES_CACHE) {
    const cache = env.ROUTES_CACHE;
    const writes: Array<Promise<void>> = [];
    for (let i = 0; i < origins.length; i++) {
      for (let j = 0; j < destinations.length; j++) {
        writes.push(persistPair(cache, origins[i], destinations[j], mode, matrix[i][j]));
      }
    }
    // Don't await — let the response land asap.
    void Promise.allSettled(writes);
  }

  // Merge cache hits (where they were present) with fresh values. The
  // network response is authoritative for the cells it returned, but
  // if Routes silently dropped a cell we still return the cached value.
  if (cached) {
    for (let i = 0; i < origins.length; i++) {
      for (let j = 0; j < destinations.length; j++) {
        if (matrix[i][j] == null && cached[i][j] !== 'miss') {
          matrix[i][j] = cached[i][j] as number | null;
        }
      }
    }
  }
  return matrix;
}

/** Score = rating × log(userRatingCount + 1) — Wilson-ish. Penalises a 5★
 *  spot with one review against a 4.5★ with 200 reviews. Returns the top
 *  hit; null if the array is empty. */
export function pickBestCafe(candidates: NearbyCafe[]): NearbyCafe | null {
  if (candidates.length === 0) return null;
  let best: NearbyCafe | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const r = c.rating ?? 0;
    const n = c.userRatingsTotal ?? 0;
    const score = r * Math.log(n + 1);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
