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
