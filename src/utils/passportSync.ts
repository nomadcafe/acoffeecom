import type { VisitedShopSnapshot } from '../types';

// Wire format must match functions/_lib/passport.ts VisitedShopWireSchema.
export interface VisitedShopWire {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  googleMapsUri?: string;
  city?: string;
  visits: number[];
}

export function toWire(s: VisitedShopSnapshot): VisitedShopWire {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    googleMapsUri: s.googleMapsUri,
    city: s.city,
    visits: s.visits,
  };
}

export function fromWire(w: VisitedShopWire): VisitedShopSnapshot {
  return {
    id: w.id,
    name: w.name,
    address: w.address,
    lat: w.lat,
    lng: w.lng,
    googleMapsUri: w.googleMapsUri,
    city: w.city,
    visits: w.visits,
  };
}

export async function claimPassport(
  shops: VisitedShopSnapshot[],
): Promise<VisitedShopSnapshot[] | null> {
  try {
    const res = await fetch('/api/passport/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shops: shops.map(toWire) }),
    });
    if (!res.ok) {
      console.error('passport claim failed:', res.status);
      return null;
    }
    const json = (await res.json()) as { shops: VisitedShopWire[] };
    return json.shops.map(fromWire);
  } catch (e) {
    console.error('passport claim error:', e);
    return null;
  }
}

export function pushVisitedShop(shop: VisitedShopSnapshot): void {
  fetch('/api/passport/visited-shops', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toWire(shop)),
  }).catch((e) => console.error('passport push failed:', e));
}

export function deleteVisitedShop(placeId: string): void {
  fetch(`/api/passport/visited-shops/${encodeURIComponent(placeId)}`, {
    method: 'DELETE',
  }).catch((e) => console.error('passport delete failed:', e));
}
