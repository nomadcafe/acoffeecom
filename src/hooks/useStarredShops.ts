import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CoffeeShop, StarredShopSnapshot } from '../types';
import { track } from '../utils/analytics';

const STORAGE_KEY = 'ACoffee-meetup-starred-shops';

function isSnapshot(x: unknown): x is StarredShopSnapshot {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as StarredShopSnapshot).id === 'string' &&
    typeof (x as StarredShopSnapshot).name === 'string'
  );
}

function normalizeStored(raw: unknown): StarredShopSnapshot[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0];
  if (typeof first === 'string') {
    return (raw as string[]).map((id) => ({
      id,
      name: 'Saved café',
      address: '',
      lat: 0,
      lng: 0,
    }));
  }
  return (raw as unknown[])
    .filter(isSnapshot)
    .map((s) => ({
      id: s.id,
      name: s.name || 'Saved café',
      address: s.address ?? '',
      lat: typeof s.lat === 'number' ? s.lat : 0,
      lng: typeof s.lng === 'number' ? s.lng : 0,
      googleMapsUri: s.googleMapsUri,
      note: typeof s.note === 'string' ? s.note : undefined,
    }));
}

function loadStarredShops(): StarredShopSnapshot[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return normalizeStored(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function snapshotToCoffeeShop(s: StarredShopSnapshot): CoffeeShop {
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

export function useStarredShops(): {
  starredShops: StarredShopSnapshot[];
  starredShopIds: string[];
  toggleStar: (shop: CoffeeShop) => void;
  updateStarredNote: (shopId: string, note: string) => void;
  isStarred: (shopId: string) => boolean;
} {
  const [starredShops, setStarredShops] = useState<StarredShopSnapshot[]>(loadStarredShops);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(starredShops));
    } catch (e) {
      console.error('Failed to save starred shops:', e);
    }
  }, [starredShops]);

  const starredShopIds = useMemo(() => starredShops.map((s) => s.id), [starredShops]);

  const toggleStar = useCallback(
    (shop: CoffeeShop) => {
      const wasStarred = starredShopIds.includes(shop.id);
      setStarredShops((prev) => {
        const exists = prev.some((s) => s.id === shop.id);
        if (exists) {
          return prev.filter((s) => s.id !== shop.id);
        }
        const snap: StarredShopSnapshot = {
          id: shop.id,
          name: shop.name,
          address: shop.address,
          lat: shop.lat,
          lng: shop.lng,
          googleMapsUri: shop.googleMapsUri,
          note: prev.find((s) => s.id === shop.id)?.note,
        };
        return [snap, ...prev.filter((s) => s.id !== shop.id)];
      });
      if (!wasStarred) track('place_starred', { placeId: shop.id });
    },
    [starredShopIds],
  );

  const updateStarredNote = useCallback((shopId: string, note: string) => {
    setStarredShops((prev) =>
      prev.map((s) => (s.id === shopId ? { ...s, note: note.trim() ? note : undefined } : s))
    );
  }, []);

  const isStarred = useCallback(
    (shopId: string) => starredShopIds.includes(shopId),
    [starredShopIds]
  );

  return { starredShops, starredShopIds, toggleStar, updateStarredNote, isStarred };
}
