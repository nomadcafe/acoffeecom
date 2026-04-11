import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type {
  Location,
  CoffeeShop,
  AppState,
  SearchSortMode,
  RecentSearchItem,
} from '../types';
import { useI18n } from './I18nContext';
import { useStarredShops } from '../hooks/useStarredShops';
import { geocodeAddress } from '../utils/geocoding';
import { calculateMidpoint } from '../utils/midpoint';
import { searchCoffeeShops, SEARCH_RADIUS_MAX_M, SEARCH_RATING_MIN } from '../utils/places';

interface AppContextType extends AppState {
  setAddressA: (address: string) => void;
  setAddressB: (address: string) => void;
  addressA: string;
  addressB: string;
  findMeetupSpot: () => Promise<void>;
  toggleStar: (shop: CoffeeShop) => void;
  isStarred: (shopId: string) => boolean;
  setMapRef: (map: google.maps.Map | null) => void;
  setSelectedCoffeeShopId: (id: string | null) => void;
  setSearchMinRating: (value: number) => void;
  setSearchRadiusMeters: (value: number) => void;
  setSearchKeyword: (value: string) => void;
  setSearchSortMode: (value: SearchSortMode) => void;
  updateStarredNote: (shopId: string, note: string) => void;
  addAddressTemplate: (address: string) => void;
  removeAddressTemplate: (address: string) => void;
  searchWithAddresses: (nextAddressA: string, nextAddressB: string) => Promise<void>;
  widenSearchParams: () => void;
  clearError: () => void;
}

const AppContext = createContext<AppContextType | null>(null);
const RECENT_SEARCHES_KEY = 'ACoffee-meetup-recent-searches';
const ADDRESS_TEMPLATES_KEY = 'ACoffee-meetup-address-templates';

function loadRecentSearches(): RecentSearchItem[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => typeof x === 'object' && x !== null)
      .map((x) => x as Partial<RecentSearchItem>)
      .filter((x) => typeof x.addressA === 'string' && typeof x.addressB === 'string')
      .map((x, idx) => ({
        id: x.id && typeof x.id === 'string' ? x.id : `legacy-${idx}`,
        addressA: x.addressA as string,
        addressB: x.addressB as string,
        createdAt: typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function loadAddressTemplates(): string[] {
  try {
    const raw = localStorage.getItem(ADDRESS_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, 12);
  } catch {
    return [];
  }
}

function sortShops(
  shops: CoffeeShop[],
  starredShopIds: string[],
  mode: SearchSortMode
): CoffeeShop[] {
  return [...shops].sort((a, b) => {
    const aStarred = starredShopIds.includes(a.id);
    const bStarred = starredShopIds.includes(b.id);
    if (aStarred && !bStarred) return -1;
    if (!aStarred && bStarred) return 1;
    if (mode === 'fairness') {
      const aDelta = Math.abs((a.distanceFromA ?? 0) - (a.distanceFromB ?? 0));
      const bDelta = Math.abs((b.distanceFromA ?? 0) - (b.distanceFromB ?? 0));
      if (aDelta !== bDelta) return aDelta - bDelta;
      const aTotal = (a.distanceFromA ?? 0) + (a.distanceFromB ?? 0);
      const bTotal = (b.distanceFromA ?? 0) + (b.distanceFromB ?? 0);
      if (aTotal !== bTotal) return aTotal - bTotal;
    }
    return b.rating - a.rating;
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [addressA, setAddressA] = useState('');
  const [addressB, setAddressB] = useState('');
  const [locationA, setLocationA] = useState<Location | null>(null);
  const [locationB, setLocationB] = useState<Location | null>(null);
  const [midpoint, setMidpoint] = useState<{ lat: number; lng: number } | null>(null);
  const [coffeeShops, setCoffeeShops] = useState<CoffeeShop[]>([]);
  const [selectedCoffeeShopId, setSelectedCoffeeShopId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMinRating, setSearchMinRating] = useState(4);
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(1200);
  const [searchKeyword, setSearchKeyword] = useState('coffee');
  const [searchSortMode, setSearchSortMode] = useState<SearchSortMode>('rating');
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(loadRecentSearches);
  const [addressTemplates, setAddressTemplates] = useState<string[]>(loadAddressTemplates);

  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const { starredShops, starredShopIds, toggleStar, updateStarredNote, isStarred } = useStarredShops();

  const setMapRef = useCallback((map: google.maps.Map | null) => {
    mapRef.current = map;
    if (map && !geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
  }, []);

  const searchWithAddresses = useCallback(
    async (nextAddressA: string, nextAddressB: string) => {
      const a = nextAddressA.trim();
      const b = nextAddressB.trim();
      if (!a || !b) {
        setError(t('errors.bothAddresses'));
        return;
      }

      if (!mapRef.current || !geocoderRef.current) {
        setError(t('errors.mapNotLoaded'));
        return;
      }

      setAddressA(a);
      setAddressB(b);
      setIsLoading(true);
      setError(null);
      setCoffeeShops([]);
      setSelectedCoffeeShopId(null);

      try {
        // Geocode both addresses in parallel
        const [coordsA, coordsB] = await Promise.all([
          geocodeAddress(a, geocoderRef.current),
          geocodeAddress(b, geocoderRef.current),
        ]);

        const locA: Location = { address: a, ...coordsA };
        const locB: Location = { address: b, ...coordsB };

        setLocationA(locA);
        setLocationB(locB);

        // Calculate midpoint
        const mid = calculateMidpoint(coordsA.lat, coordsA.lng, coordsB.lat, coordsB.lng);
        setMidpoint(mid);

        const { shops } = await searchCoffeeShops(
          mapRef.current,
          mid,
          coordsA,
          coordsB,
          searchMinRating,
          searchRadiusMeters,
          searchKeyword
        );
        setCoffeeShops(sortShops(shops, starredShopIds, searchSortMode));

        const recent: RecentSearchItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          addressA: a,
          addressB: b,
          createdAt: Date.now(),
        };
        setRecentSearches((prev) => {
          const next = [recent, ...prev.filter((r) => !(r.addressA === a && r.addressB === b))].slice(0, 8);
          try {
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
          } catch {
            // Ignore storage quota and privacy mode errors.
          }
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : t('errors.generic'));
      } finally {
        setIsLoading(false);
      }
    },
    [searchMinRating, searchRadiusMeters, searchKeyword, starredShopIds, searchSortMode, t]
  );

  const findMeetupSpot = useCallback(async () => {
    if (!addressA.trim() || !addressB.trim()) {
      setError(t('errors.bothAddresses'));
      return;
    }
    await searchWithAddresses(addressA, addressB);
  }, [addressA, addressB, searchWithAddresses, t]);

  const addAddressTemplate = useCallback((address: string) => {
    const clean = address.trim();
    if (!clean) return;
    setAddressTemplates((prev) => {
      const next = [clean, ...prev.filter((x) => x !== clean)].slice(0, 12);
      try {
        localStorage.setItem(ADDRESS_TEMPLATES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota and privacy mode errors.
      }
      return next;
    });
  }, []);

  const removeAddressTemplate = useCallback((address: string) => {
    setAddressTemplates((prev) => {
      const next = prev.filter((x) => x !== address);
      try {
        localStorage.setItem(ADDRESS_TEMPLATES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota and privacy mode errors.
      }
      return next;
    });
  }, []);

  const widenSearchParams = useCallback(() => {
    setSearchRadiusMeters((r) => Math.min(SEARCH_RADIUS_MAX_M, r + 1000));
    setSearchMinRating((m) =>
      Math.max(SEARCH_RATING_MIN, Math.round((m - 0.5) * 10) / 10)
    );
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        locationA,
        locationB,
        midpoint,
        coffeeShops,
        selectedCoffeeShopId,
        starredShops,
        isLoading,
        error,
        searchMinRating,
        searchRadiusMeters,
        searchKeyword,
        searchSortMode,
        recentSearches,
        addressTemplates,
        addressA,
        addressB,
        setAddressA,
        setAddressB,
        setSearchMinRating,
        setSearchRadiusMeters,
        setSearchKeyword,
        setSearchSortMode,
        widenSearchParams,
        clearError,
        findMeetupSpot,
        searchWithAddresses,
        toggleStar,
        updateStarredNote,
        addAddressTemplate,
        removeAddressTemplate,
        isStarred,
        setMapRef,
        setSelectedCoffeeShopId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
