import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'coffee-meetup-starred-shops';

export function useStarredShops(): {
  starredShopIds: string[];
  toggleStar: (shopId: string) => void;
  isStarred: (shopId: string) => boolean;
} {
  const [starredShopIds, setStarredShopIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(starredShopIds));
    } catch (e) {
      console.error('Failed to save starred shops:', e);
    }
  }, [starredShopIds]);

  const toggleStar = useCallback((shopId: string) => {
    setStarredShopIds((prev) => {
      if (prev.includes(shopId)) {
        return prev.filter((id) => id !== shopId);
      }
      return [...prev, shopId];
    });
  }, []);

  const isStarred = useCallback(
    (shopId: string) => starredShopIds.includes(shopId),
    [starredShopIds]
  );

  return { starredShopIds, toggleStar, isStarred };
}
