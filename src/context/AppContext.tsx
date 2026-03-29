import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Location, CoffeeShop, AppState } from '../types';
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
  widenSearchParams: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

function sortShopsByStarAndRating(shops: CoffeeShop[], starredShopIds: string[]): CoffeeShop[] {
  return [...shops].sort((a, b) => {
    const aStarred = starredShopIds.includes(a.id);
    const bStarred = starredShopIds.includes(b.id);
    if (aStarred && !bStarred) return -1;
    if (!aStarred && bStarred) return 1;
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

  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const { starredShops, starredShopIds, toggleStar, isStarred } = useStarredShops();

  const setMapRef = useCallback((map: google.maps.Map | null) => {
    mapRef.current = map;
    if (map && !geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
  }, []);

  const findMeetupSpot = useCallback(async () => {
    if (!addressA.trim() || !addressB.trim()) {
      setError(t('errors.bothAddresses'));
      return;
    }

    if (!mapRef.current || !geocoderRef.current) {
      setError(t('errors.mapNotLoaded'));
      return;
    }

    setIsLoading(true);
    setError(null);
    setCoffeeShops([]);
    setSelectedCoffeeShopId(null);

    try {
      // Geocode both addresses in parallel
      const [coordsA, coordsB] = await Promise.all([
        geocodeAddress(addressA, geocoderRef.current),
        geocodeAddress(addressB, geocoderRef.current),
      ]);

      const locA: Location = { address: addressA, ...coordsA };
      const locB: Location = { address: addressB, ...coordsB };

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
      setCoffeeShops(sortShopsByStarAndRating(shops, starredShopIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    } finally {
      setIsLoading(false);
    }
  }, [addressA, addressB, starredShopIds, searchMinRating, searchRadiusMeters, searchKeyword, t]);

  const widenSearchParams = useCallback(() => {
    setSearchRadiusMeters((r) => Math.min(SEARCH_RADIUS_MAX_M, r + 1000));
    setSearchMinRating((m) =>
      Math.max(SEARCH_RATING_MIN, Math.round((m - 0.5) * 10) / 10)
    );
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
        addressA,
        addressB,
        setAddressA,
        setAddressB,
        setSearchMinRating,
        setSearchRadiusMeters,
        setSearchKeyword,
        widenSearchParams,
        findMeetupSpot,
        toggleStar,
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
