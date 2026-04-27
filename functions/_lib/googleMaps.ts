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
