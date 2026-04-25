import type { StarredShopSnapshot } from '../types';

// Wire format must match functions/_lib/starred.ts StarredShopWireSchema.
export interface StarredShopWire {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  googleMapsUri?: string;
  note?: string;
  updatedAt: number;
  deleted?: boolean;
}

export function toWire(s: StarredShopSnapshot): StarredShopWire {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    googleMapsUri: s.googleMapsUri,
    note: s.note,
    updatedAt: s.updatedAt,
  };
}

export function fromWire(w: StarredShopWire): StarredShopSnapshot {
  return {
    id: w.id,
    name: w.name,
    address: w.address,
    lat: w.lat,
    lng: w.lng,
    googleMapsUri: w.googleMapsUri,
    note: w.note,
    updatedAt: w.updatedAt,
  };
}

export async function claimStarred(
  shops: StarredShopSnapshot[],
): Promise<StarredShopSnapshot[] | null> {
  try {
    const res = await fetch('/api/starred/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shops: shops.map(toWire) }),
    });
    if (!res.ok) {
      console.error('starred claim failed:', res.status);
      return null;
    }
    const json = (await res.json()) as { shops: StarredShopWire[] };
    return json.shops.map(fromWire);
  } catch (e) {
    console.error('starred claim error:', e);
    return null;
  }
}

export async function pushStarredShopWire(wire: StarredShopWire): Promise<boolean> {
  try {
    const res = await fetch('/api/starred/shops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(wire),
    });
    if (!res.ok) console.error('starred push failed:', res.status);
    return res.ok;
  } catch (e) {
    console.error('starred push error:', e);
    return false;
  }
}

export async function deleteStarredShop(placeId: string, ts: number): Promise<boolean> {
  try {
    const url = `/api/starred/shops/${encodeURIComponent(placeId)}?ts=${ts}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) console.error('starred delete failed:', res.status);
    return res.ok;
  } catch (e) {
    console.error('starred delete error:', e);
    return false;
  }
}
