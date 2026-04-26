import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CoffeeShop, VisitedShopSnapshot } from '../types';
import { track } from '../utils/analytics';
import { extractCity } from '../utils/city';

const STORAGE_KEY = 'ACoffee-meetup-visited-shops';
/** Taps within this window count as one stamp (prevents accidental double-taps). */
const DEBOUNCE_MS = 2000;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function normalizeStored(raw: unknown): VisitedShopSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const legacyTs = Date.now();
  return raw
    .filter(isRecord)
    .map((s): VisitedShopSnapshot | null => {
      if (typeof s.id !== 'string' || typeof s.name !== 'string') return null;
      if (!Array.isArray(s.visits)) return null;
      const visits = (s.visits as unknown[]).filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n),
      );
      if (visits.length === 0) return null;
      const address = typeof s.address === 'string' ? s.address : '';
      const storedCity = typeof s.city === 'string' && s.city.trim() ? s.city : undefined;
      return {
        id: s.id,
        name: s.name || 'Visited café',
        address,
        lat: typeof s.lat === 'number' ? s.lat : 0,
        lng: typeof s.lng === 'number' ? s.lng : 0,
        googleMapsUri: typeof s.googleMapsUri === 'string' ? s.googleMapsUri : undefined,
        visits: [...visits].sort((a, b) => b - a),
        city: storedCity ?? extractCity(address) ?? undefined,
        // Pre-sync schema had no updatedAt; backfill once on read so LWW has a key.
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : legacyTs,
      };
    })
    .filter((x): x is VisitedShopSnapshot => x != null);
}

function loadVisitedShops(): VisitedShopSnapshot[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return normalizeStored(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function visitedSnapshotToCoffeeShop(s: VisitedShopSnapshot): CoffeeShop {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    rating: 0,
    userRatingsTotal: 0,
    googleMapsUri: s.googleMapsUri,
  };
}

export function useVisitedShops(): {
  visitedShops: VisitedShopSnapshot[];
  visitedShopIds: string[];
  addVisit: (shop: CoffeeShop) => void;
  removeVisited: (shopId: string) => void;
  /** Remove a single visit timestamp; clears the shop entirely if it was the last visit. */
  removeVisitAt: (shopId: string, ts: number) => void;
  /** Replace the entire visited list (used by cloud sync to reconcile with server). */
  replaceVisited: (next: VisitedShopSnapshot[]) => void;
  isVisited: (shopId: string) => boolean;
  visitCount: (shopId: string) => number;
  lastVisit: (shopId: string) => number | null;
} {
  const [visitedShops, setVisitedShops] = useState<VisitedShopSnapshot[]>(loadVisitedShops);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visitedShops));
    } catch (e) {
      console.error('Failed to save visited shops:', e);
    }
  }, [visitedShops]);

  const visitedShopIds = useMemo(() => visitedShops.map((s) => s.id), [visitedShops]);

  const addVisit = useCallback(
    (shop: CoffeeShop) => {
      const now = Date.now();
      const existing = visitedShops.find((s) => s.id === shop.id);
      const lastTap = existing?.visits[0];
      const isDebounced = lastTap != null && now - lastTap < DEBOUNCE_MS;
      setVisitedShops((prev) => {
        const prevExisting = prev.find((s) => s.id === shop.id);
        if (prevExisting) {
          // Debounce: ignore taps within DEBOUNCE_MS of the last visit for this shop.
          if (prevExisting.visits[0] != null && now - prevExisting.visits[0] < DEBOUNCE_MS) {
            return prev;
          }
          return prev.map((s) =>
            s.id === shop.id
              ? { ...s, visits: [now, ...s.visits], updatedAt: now }
              : s,
          );
        }
        const snap: VisitedShopSnapshot = {
          id: shop.id,
          name: shop.name,
          address: shop.address,
          lat: shop.lat,
          lng: shop.lng,
          googleMapsUri: shop.googleMapsUri,
          visits: [now],
          city: extractCity(shop.address) ?? undefined,
          updatedAt: now,
        };
        return [snap, ...prev];
      });
      if (!isDebounced) {
        track('place_visited', { placeId: shop.id, isNew: !existing });
      }
    },
    [visitedShops],
  );

  const removeVisited = useCallback((shopId: string) => {
    setVisitedShops((prev) => prev.filter((s) => s.id !== shopId));
  }, []);

  /**
   * Drop a single visit timestamp from a shop's history. If that was the
   * last visit, the whole shop is removed (the diff sync turns it into a
   * delete tombstone). Bumps updatedAt so cloud sync notices the change.
   */
  const removeVisitAt = useCallback((shopId: string, ts: number) => {
    setVisitedShops((prev) => {
      const next: VisitedShopSnapshot[] = [];
      for (const s of prev) {
        if (s.id !== shopId) {
          next.push(s);
          continue;
        }
        const filtered = s.visits.filter((t) => t !== ts);
        if (filtered.length === 0) continue; // shop dropped from list entirely
        next.push({ ...s, visits: filtered, updatedAt: Date.now() });
      }
      return next;
    });
  }, []);

  const replaceVisited = useCallback((next: VisitedShopSnapshot[]) => {
    setVisitedShops(next);
  }, []);

  const isVisited = useCallback(
    (shopId: string) => visitedShopIds.includes(shopId),
    [visitedShopIds],
  );

  const visitCount = useCallback(
    (shopId: string) => visitedShops.find((s) => s.id === shopId)?.visits.length ?? 0,
    [visitedShops],
  );

  const lastVisit = useCallback(
    (shopId: string) => visitedShops.find((s) => s.id === shopId)?.visits[0] ?? null,
    [visitedShops],
  );

  return {
    visitedShops,
    visitedShopIds,
    addVisit,
    removeVisited,
    removeVisitAt,
    replaceVisited,
    isVisited,
    visitCount,
    lastVisit,
  };
}
