import type { CoffeeShop } from '../types';
import { calculateDistance } from './midpoint';

export const SEARCH_RADIUS_MIN_M = 400;
export const SEARCH_RADIUS_MAX_M = 10_000;
export const SEARCH_RATING_MIN = 3;
export const SEARCH_RATING_MAX = 5;

/** Extra meters when filtering by radius so slight API / floating-point differences do not drop valid rows. */
const RADIUS_FILTER_BUFFER_M = 100;

/**
 * Maps the keyword to Places (New) `includedPrimaryTypes` only.
 * The Maps JavaScript `Place.searchNearby` request does not support `textQuery`
 * (it triggers "unknown property textQuery" at runtime), so we never send it.
 */
export function resolveNearbySearchParams(keyword: string): {
  includedPrimaryTypes: string[];
  /** True when search is still café-only (allows optional name refine below). */
  isDefaultCafeSearch: boolean;
} {
  const raw = keyword.trim();
  const k = raw.toLowerCase();
  if (!raw || k === 'coffee') {
    return { includedPrimaryTypes: ['cafe', 'coffee_shop'], isDefaultCafeSearch: true };
  }

  const words = k.split(/\s+/).filter(Boolean);
  const hotelish = ['hotel', 'lodging', 'motel', 'hostel', 'inn', 'resort'];
  if (words.some((w) => hotelish.includes(w))) {
    return { includedPrimaryTypes: ['lodging'], isDefaultCafeSearch: false };
  }
  const foodish = ['restaurant', 'dining', 'eatery', 'bistro'];
  if (words.some((w) => foodish.includes(w))) {
    return { includedPrimaryTypes: ['restaurant'], isDefaultCafeSearch: false };
  }
  if (words.includes('bar') || words.includes('pub')) {
    return { includedPrimaryTypes: ['bar'], isDefaultCafeSearch: false };
  }

  return { includedPrimaryTypes: ['cafe', 'coffee_shop'], isDefaultCafeSearch: true };
}

/** Narrow café results by display name when the API cannot take a free-text query. */
function nameMatchesKeyword(displayName: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k || k === 'coffee') return true;
  const name = displayName.toLowerCase();
  return k.split(/\s+/).every((part) => part.length > 0 && name.includes(part));
}

function mapPlacesToCoffeeShops(
  places: google.maps.places.Place[],
  locationA: { lat: number; lng: number },
  locationB: { lat: number; lng: number },
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
      const photoUrl = p.photos?.[0]?.getURI({ maxWidth: 200 });

      const gUri = p.googleMapsURI?.trim();
      return {
        id: p.id,
        name: p.displayName ?? 'Unknown',
        address: p.formattedAddress ?? '',
        lat,
        lng,
        rating: p.rating ?? 0,
        userRatingsTotal: p.userRatingCount ?? 0,
        distanceFromA: calculateDistance(locationA.lat, locationA.lng, lat, lng),
        distanceFromB: calculateDistance(locationB.lat, locationB.lng, lat, lng),
        distanceFromMidpoint,
        photoUrl: photoUrl ?? undefined,
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
  'photos',
  'googleMapsURI',
];

/**
 * Nearby search via Places API (New) {@link google.maps.places.Place.searchNearby}.
 * Does not use legacy {@link google.maps.places.PlacesService} (blocked for new GCP projects since Mar 2025).
 * Returns up to 20 places per search; pagination is not exposed on this JS surface.
 */
export async function searchCoffeeShopsPaginated(
  _map: google.maps.Map,
  midpoint: { lat: number; lng: number },
  locationA: { lat: number; lng: number },
  locationB: { lat: number; lng: number },
  minRating: number = 4.0,
  radiusMeters: number = 1200,
  keyword: string = 'coffee'
): Promise<{ shops: CoffeeShop[] }> {
  const radius = Math.min(50_000, Math.max(200, Math.round(radiusMeters)));
  const kw = keyword.trim() || 'coffee';
  const ratingFloor = Math.min(SEARCH_RATING_MAX, Math.max(1, minRating));
  const { includedPrimaryTypes, isDefaultCafeSearch } = resolveNearbySearchParams(kw);

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

    if (isDefaultCafeSearch && kw.trim() && kw.trim().toLowerCase() !== 'coffee') {
      shops = shops.filter((s) => nameMatchesKeyword(s.name, kw));
    }

    return { shops };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Places search failed: ${message}. Enable "Places API (New)" for this API key in Google Cloud Console.`
    );
  }
}

/**
 * Same behavior as {@link searchCoffeeShopsPaginated}.
 * Stable import name for the app context.
 */
export function searchCoffeeShops(
  map: google.maps.Map,
  midpoint: { lat: number; lng: number },
  locationA: { lat: number; lng: number },
  locationB: { lat: number; lng: number },
  minRating?: number,
  radiusMeters?: number,
  keyword?: string
): Promise<{ shops: CoffeeShop[] }> {
  return searchCoffeeShopsPaginated(
    map,
    midpoint,
    locationA,
    locationB,
    minRating,
    radiusMeters,
    keyword
  );
}
