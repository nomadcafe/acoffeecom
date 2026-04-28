import type { CoffeeShop, PlaceSearchCategory, SearchSortMode } from '../types';
import { calculateDistance } from './midpoint';
import {
  isLikelyNetworkError,
  reportGoogleNetworkError,
  reportGoogleNetworkOk,
} from './networkStatus';

export const SEARCH_RADIUS_MIN_M = 400;
export const SEARCH_RADIUS_MAX_M = 10_000;
export const SEARCH_RATING_MIN = 3;
export const SEARCH_RATING_MAX = 5;

/** Extra meters when filtering by radius so slight API / floating-point differences do not drop valid rows. */
const RADIUS_FILTER_BUFFER_M = 100;

export function includedTypesForCategory(category: PlaceSearchCategory): string[] {
  switch (category) {
    case 'restaurant':
      return ['restaurant'];
    case 'lodging':
      return ['lodging'];
    case 'bar':
      return ['bar'];
    default:
      return ['cafe', 'coffee_shop'];
  }
}

/** Narrow café results by display name when the API cannot take a free-text query. */
function nameMatchesKeyword(displayName: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k || k === 'coffee') return true;
  const name = displayName.toLowerCase();
  return k.split(/\s+/).every((part) => part.length > 0 && name.includes(part));
}

function computeOpenNow(p: google.maps.places.Place): boolean | undefined {
  // Places (New) `regularOpeningHours.periods` is a list of
  // { open: { day, hour, minute }, close: { day, hour, minute } } entries;
  // day is 0–6 (Sunday=0). Walk the periods and test whether "now" falls
  // inside any of them. Return undefined when the hours are unknown so the
  // UI can show "no status" rather than guessing.
  try {
    const periods = p.regularOpeningHours?.periods;
    if (!periods || periods.length === 0) return undefined;
    const now = new Date();
    const nowDay = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const period of periods) {
      const o = period.open;
      const c = period.close;
      if (!o) continue;
      const openMin = (o.hour ?? 0) * 60 + (o.minute ?? 0);
      // No close → interpreted by Google as 24h (from the open point).
      if (!c) {
        if (o.day === nowDay) return true;
        continue;
      }
      const closeMin = (c.hour ?? 0) * 60 + (c.minute ?? 0);
      // Same-day period.
      if (o.day === c.day && o.day === nowDay && nowMin >= openMin && nowMin < closeMin) {
        return true;
      }
      // Wraps past midnight (e.g. bar open Fri 18:00 → Sat 02:00).
      if (o.day !== c.day) {
        if (nowDay === o.day && nowMin >= openMin) return true;
        if (nowDay === c.day && nowMin < closeMin) return true;
      }
    }
    return false;
  } catch {
    return undefined;
  }
}

function mapPlacesToCoffeeShops(
  places: google.maps.places.Place[],
  locationA: { lat: number; lng: number } | null,
  locationB: { lat: number; lng: number } | null,
  locationC: { lat: number; lng: number } | null,
  midpoint: { lat: number; lng: number },
  minRating: number,
  searchRadiusMeters: number
): CoffeeShop[] {
  const maxFromMidpoint = searchRadiusMeters + RADIUS_FILTER_BUFFER_M;

  return places
    .filter((p) => (p.rating ?? 0) >= minRating)
    .map((p) => {
      const lat = p.location?.lat() ?? 0;
      const lng = p.location?.lng() ?? 0;
      const distanceFromMidpoint = calculateDistance(midpoint.lat, midpoint.lng, lat, lng);
      const gUri = p.googleMapsURI?.trim();
      // Places (New) returns priceLevel as the enum string
      // PRICE_LEVEL_FREE / INEXPENSIVE / MODERATE / EXPENSIVE / VERY_EXPENSIVE,
      // unset when unknown. Map to numeric 0–4 (0 = free) so the cheap mode
      // can do `<= 2` cleanly. Untracked → undefined (not 0).
      const priceLevel = priceLevelToNumber(
        p.priceLevel as unknown as string | undefined,
      );
      return {
        id: p.id,
        name: p.displayName ?? 'Unknown',
        address: p.formattedAddress ?? '',
        lat,
        lng,
        rating: p.rating ?? 0,
        userRatingsTotal: p.userRatingCount ?? 0,
        distanceFromA: locationA
          ? calculateDistance(locationA.lat, locationA.lng, lat, lng)
          : undefined,
        distanceFromB: locationB
          ? calculateDistance(locationB.lat, locationB.lng, lat, lng)
          : undefined,
        distanceFromC: locationC
          ? calculateDistance(locationC.lat, locationC.lng, lat, lng)
          : undefined,
        distanceFromMidpoint,
        isOpen: computeOpenNow(p),
        googleMapsUri: gUri ? gUri : undefined,
        priceLevel,
      };
    })
    .filter((shop) => (shop.distanceFromMidpoint ?? 0) <= maxFromMidpoint)
    .sort((a, b) => b.rating - a.rating);
}

function priceLevelToNumber(raw: string | undefined): number | undefined {
  switch (raw) {
    case 'PRICE_LEVEL_FREE':
      return 0;
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return undefined;
  }
}

const NEARBY_FIELDS: string[] = [
  'id',
  'displayName',
  'location',
  'formattedAddress',
  'rating',
  'priceLevel',
  'userRatingCount',
  'googleMapsURI',
  'regularOpeningHours',
];

/**
 * Nearby search via Places API (New) {@link google.maps.places.Place.searchNearby}.
 * Does not use legacy {@link google.maps.places.PlacesService} (blocked for new GCP projects since Mar 2025).
 * Returns up to 20 places per search; pagination is not exposed on this JS surface.
 */
export async function searchCoffeeShops(
  midpoint: { lat: number; lng: number },
  locationA: { lat: number; lng: number } | null,
  locationB: { lat: number; lng: number } | null,
  locationC: { lat: number; lng: number } | null,
  minRating: number = 4.0,
  radiusMeters: number = 1200,
  placeCategory: PlaceSearchCategory = 'cafe',
  keyword: string = '',
  openNowOnly: boolean = false
): Promise<{ shops: CoffeeShop[] }> {
  const radius = Math.min(50_000, Math.max(200, Math.round(radiusMeters)));
  const kw = keyword.trim();
  const ratingFloor = Math.min(SEARCH_RATING_MAX, Math.max(1, minRating));
  const includedPrimaryTypes = includedTypesForCategory(placeCategory);

  const lib = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  const { Place, SearchNearbyRankPreference } = lib;

  try {
    const request: google.maps.places.SearchNearbyRequest = {
      fields: NEARBY_FIELDS,
      locationRestriction: {
        center: { lat: midpoint.lat, lng: midpoint.lng },
        radius,
      },
      includedPrimaryTypes,
      maxResultCount: 20,
      rankPreference: SearchNearbyRankPreference.DISTANCE,
    };

    const { places } = await Place.searchNearby(request);

    let shops = mapPlacesToCoffeeShops(
      places,
      locationA,
      locationB,
      locationC,
      midpoint,
      ratingFloor,
      radius
    );

    // Keyword is post-hoc client-side name matching (the Places API has no
    // free-text search). Empty string means "no name filter" — the place
    // category alone scopes the search.
    if (kw.length > 0) {
      shops = shops.filter((s) => nameMatchesKeyword(s.name, kw));
    }

    if (openNowOnly) {
      // Strict: also drop places with unknown hours, not just the ones we know are closed.
      shops = shops.filter((s) => s.isOpen === true);
    }

    reportGoogleNetworkOk();
    return { shops };
  } catch (e) {
    if (isLikelyNetworkError(e)) {
      reportGoogleNetworkError();
      throw new Error('NETWORK_UNREACHABLE');
    }
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Places search failed: ${message}. Enable "Places API (New)" for this API key in Google Cloud Console.`
    );
  }
}

/**
 * Mutates `shops` in place by adding `durationFromA/B/C` (seconds) for
 * the top N candidates, calling the server-side Routes proxy so the
 * client never sees the API key. Caps the matrix size to keep cost
 * bounded — see the endpoint's input schema for the per-side caps.
 *
 * Soft-fails on any error: returns the original shops unchanged so a
 * Routes outage doesn't block the search. Caller can detect
 * "no durations populated" and fall back to distance-based fairness.
 *
 * Cost guards (default ON):
 *   - top 5 candidates only (was 8) → 38% fewer elements per call
 *   - skip entirely for 2-party rating-sort searches; only enrich when
 *     fairness sort is selected OR there are 3 parties (the cases where
 *     time-fair data demonstrably helps the decision)
 *   - server-side KV cache de-duplicates per (origin, dest, mode) pair
 *     for an hour, so repeat searches and shared links pay nothing
 */
export async function enrichWithDurations(
  shops: CoffeeShop[],
  parties: Array<{ lat: number; lng: number } | null>,
  options: {
    /** Only 'fairness' / 'fast' / 'now' care about duration data. Other
     *  sort modes don't render minutes prominently, so we skip the call. */
    sortMode?: SearchSortMode;
    topN?: number;
  } = {},
): Promise<void> {
  const origins = parties.filter((p): p is { lat: number; lng: number } => p != null);
  if (origins.length < 2) return;
  if (shops.length === 0) return;
  const topN = options.topN ?? 5;
  // Conditional: only call Routes when the time data demonstrably
  // changes the user's decision. 3-party midpoint always benefits
  // (geographic centroid is often unfair). 2-party only benefits when
  // the user explicitly opted into a time-aware sort — rating /
  // quiet / cheap users see distances and care less about minutes.
  const wantsTime =
    options.sortMode === 'fairness' || options.sortMode === 'fast';
  if (origins.length < 3 && !wantsTime) return;

  const candidates = shops.slice(0, topN);
  if (candidates.length === 0) return;
  try {
    const r = await fetch('/api/places/eta', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origins,
        destinations: candidates.map((s) => ({ lat: s.lat, lng: s.lng })),
        mode: 'TRANSIT',
      }),
    });
    if (!r.ok) return;
    const json = (await r.json()) as { matrix?: (number | null)[][] };
    const matrix = json.matrix;
    if (!matrix || matrix.length === 0) return;
    // Map back from origins-array index to A/B/C field names. parties
    // is sparse (some may be null when fewer than 3 set), so we walk
    // along it tracking the contiguous origin index.
    const partyToOrigin: number[] = [];
    let next = 0;
    for (const p of parties) partyToOrigin.push(p ? next++ : -1);

    const idxA = partyToOrigin[0];
    const idxB = partyToOrigin[1];
    const idxC = partyToOrigin[2];

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const dA = idxA >= 0 ? matrix[idxA]?.[i] : null;
      const dB = idxB >= 0 ? matrix[idxB]?.[i] : null;
      const dC = idxC >= 0 ? matrix[idxC]?.[i] : null;
      if (typeof dA === 'number') c.durationFromA = dA;
      if (typeof dB === 'number') c.durationFromB = dB;
      if (typeof dC === 'number') c.durationFromC = dC;
    }
  } catch {
    // Silent — distance-based fairness still works.
  }
}

