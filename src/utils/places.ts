import type { CoffeeShop, PlaceSearchCategory } from '../types';
import { calculateDistance } from './midpoint';

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
        distanceFromMidpoint,
        isOpen: computeOpenNow(p),
        googleMapsUri: gUri ? gUri : undefined,
      };
    })
    .filter((shop) => (shop.distanceFromMidpoint ?? 0) <= maxFromMidpoint)
    .sort((a, b) => b.rating - a.rating);
}

const NEARBY_FIELDS: string[] = [
  'id',
  'displayName',
  'location',
  'formattedAddress',
  'rating',
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
  _map: google.maps.Map,
  midpoint: { lat: number; lng: number },
  locationA: { lat: number; lng: number } | null,
  locationB: { lat: number; lng: number } | null,
  minRating: number = 4.0,
  radiusMeters: number = 1200,
  placeCategory: PlaceSearchCategory = 'cafe',
  keyword: string = 'coffee',
  openNowOnly: boolean = false
): Promise<{ shops: CoffeeShop[] }> {
  const radius = Math.min(50_000, Math.max(200, Math.round(radiusMeters)));
  const kw = keyword.trim() || 'coffee';
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
      midpoint,
      ratingFloor,
      radius
    );

    if (placeCategory === 'cafe' && kw.trim() && kw.trim().toLowerCase() !== 'coffee') {
      shops = shops.filter((s) => nameMatchesKeyword(s.name, kw));
    }

    if (openNowOnly) {
      // Strict: also drop places with unknown hours, not just the ones we know are closed.
      shops = shops.filter((s) => s.isOpen === true);
    }

    return { shops };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Places search failed: ${message}. Enable "Places API (New)" for this API key in Google Cloud Console.`
    );
  }
}

