import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CoffeeShop, VisitedShopSnapshot } from '../types';

const STORAGE_KEY = 'ACoffee-meetup-visited-shops';

function isSnapshot(x: unknown): x is VisitedShopSnapshot {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as VisitedShopSnapshot).id === 'string' &&
    typeof (x as VisitedShopSnapshot).name === 'string'
  );
}

function normalizeStored(raw: unknown): VisitedShopSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter(isSnapshot)
    .map((s) => ({
      id: s.id,
      name: s.name || 'Visited café',
      address: s.address ?? '',
      lat: typeof s.lat === 'number' ? s.lat : 0,
      lng: typeof s.lng === 'number' ? s.lng : 0,
      googleMapsUri: s.googleMapsUri,
      visitedAt: typeof s.visitedAt === 'number' ? s.visitedAt : Date.now(),
    }));
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
  toggleVisited: (shop: CoffeeShop) => void;
  isVisited: (shopId: string) => boolean;
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

  const toggleVisited = useCallback((shop: CoffeeShop) => {
    setVisitedShops((prev) => {
      const exists = prev.some((s) => s.id === shop.id);
      if (exists) {
        return prev.filter((s) => s.id !== shop.id);
      }
      const snap: VisitedShopSnapshot = {
        id: shop.id,
        name: shop.name,
        address: shop.address,
        lat: shop.lat,
        lng: shop.lng,
        googleMapsUri: shop.googleMapsUri,
        visitedAt: Date.now(),
      };
      return [snap, ...prev];
    });
  }, []);

  const isVisited = useCallback(
    (shopId: string) => visitedShopIds.includes(shopId),
    [visitedShopIds],
  );

  return { visitedShops, visitedShopIds, toggleVisited, isVisited };
}
