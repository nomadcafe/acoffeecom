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
  updatedAt: number;
  deleted?: boolean;
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
    updatedAt: s.updatedAt,
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
    updatedAt: w.updatedAt,
  };
}

export interface ClaimResult {
  shops: VisitedShopSnapshot[];
  cursor: number;
}

export async function claimPassport(
  shops: VisitedShopSnapshot[],
): Promise<ClaimResult | null> {
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
    const json = (await res.json()) as { shops: VisitedShopWire[]; cursor?: number };
    return { shops: json.shops.map(fromWire), cursor: json.cursor ?? 0 };
  } catch (e) {
    console.error('passport claim error:', e);
    return null;
  }
}

export interface PullResult {
  /** Includes tombstones (deleted=true) so the caller can prune local state. */
  shops: VisitedShopWire[];
  cursor: number;
}

export async function pullVisited(since: number): Promise<PullResult | null> {
  try {
    const res = await fetch(`/api/passport?since=${encodeURIComponent(since)}`);
    if (!res.ok) {
      console.error('passport pull failed:', res.status);
      return null;
    }
    const json = (await res.json()) as { shops: VisitedShopWire[]; cursor?: number };
    return { shops: json.shops, cursor: json.cursor ?? since };
  } catch (e) {
    console.error('passport pull error:', e);
    return null;
  }
}

export async function pushVisitedShopWire(wire: VisitedShopWire): Promise<boolean> {
  try {
    const res = await fetch('/api/passport/visited-shops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(wire),
    });
    if (!res.ok) console.error('passport push failed:', res.status);
    return res.ok;
  } catch (e) {
    console.error('passport push error:', e);
    return false;
  }
}

export async function deleteVisitedShop(placeId: string, ts: number): Promise<boolean> {
  try {
    const url = `/api/passport/visited-shops/${encodeURIComponent(placeId)}?ts=${ts}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) console.error('passport delete failed:', res.status);
    return res.ok;
  } catch (e) {
    console.error('passport delete error:', e);
    return false;
  }
}
