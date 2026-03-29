import type { CoffeeShop } from '../types';
import { calculateDistance } from './midpoint';

export const SEARCH_RADIUS_MIN_M = 400;
export const SEARCH_RADIUS_MAX_M = 10_000;
export const SEARCH_RATING_MIN = 3;
export const SEARCH_RATING_MAX = 5;

/** Extra meters when filtering by radius so slight API / floating-point differences do not drop valid rows. */
const RADIUS_FILTER_BUFFER_M = 100;

function passesKeywordFilter(displayName: string, keyword: string): boolean {
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
  searchRadiusMeters: number,
  keyword: string
): CoffeeShop[] {
  const maxFromMidpoint = searchRadiusMeters + RADIUS_FILTER_BUFFER_M;

  return places
    .filter((p) => (p.rating ?? 0) >= minRating)
    .filter((p) => passesKeywordFilter(p.displayName ?? '', keyword))
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

  const lib = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  const { Place, SearchNearbyRankPreference } = lib;

  try {
    const { places } = await Place.searchNearby({
      fields: NEARBY_FIELDS,
      locationRestriction: {
        center: { lat: midpoint.lat, lng: midpoint.lng },
        radius,
      },
      includedPrimaryTypes: ['cafe', 'coffee_shop'],
      maxResultCount: 20,
      rankPreference: SearchNearbyRankPreference.DISTANCE,
    });

    const shops = mapPlacesToCoffeeShops(
      places,
      locationA,
      locationB,
      midpoint,
      ratingFloor,
      radius,
      kw
    );

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
