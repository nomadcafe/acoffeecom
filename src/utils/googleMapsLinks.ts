import type { CoffeeShop } from '../types';

/**
 * Prefer Places (New) `googleMapsURI`; otherwise open by place `id` (strip `places/` prefix if present);
 * final fallback: coordinates.
 */
export function getOpenInGoogleMapsUrl(shop: CoffeeShop): string {
  const uri = shop.googleMapsUri?.trim();
  if (uri) return uri;

  const rawId = shop.id?.trim();
  if (rawId) {
    const placeId = rawId.startsWith('places/') ? rawId.slice('places/'.length) : rawId;
    return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.lat},${shop.lng}`)}`;
}

/**
 * Direct-to-directions URL. Opens Google Maps with the destination
 * pre-filled and routing UI active — user just adds their origin (or
 * Google fills in current location). Uses both `destination` (the
 * place name as a query string fallback) and `destination_place_id`
 * (the canonical place ID) per Google's URL spec, so the place page
 * resolves correctly even if the placeId format ever drifts.
 */
export function getDirectionsUrl(opts: {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string {
  const params = new URLSearchParams();
  params.set('api', '1');

  const rawId = opts.placeId?.trim();
  const placeId = rawId
    ? rawId.startsWith('places/')
      ? rawId.slice('places/'.length)
      : rawId
    : null;

  // `destination` is required by the API; place_id is the precision hit.
  const labelDest = opts.name?.trim() || opts.address?.trim();
  if (labelDest) {
    params.set('destination', labelDest);
  } else if (typeof opts.lat === 'number' && typeof opts.lng === 'number') {
    params.set('destination', `${opts.lat},${opts.lng}`);
  } else if (placeId) {
    params.set('destination', placeId);
  }
  if (placeId) {
    params.set('destination_place_id', placeId);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
