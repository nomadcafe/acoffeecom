import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import type {
  Location,
  CoffeeShop,
  AppState,
  SearchMode,
  SearchSortMode,
  RecentSearchItem,
  PlaceSearchCategory,
} from '../types';
import { useI18n } from './I18nContext';
import { useStarredShops } from '../hooks/useStarredShops';
import { useVisitedShops } from '../hooks/useVisitedShops';
import { geocodeAddress } from '../utils/geocoding';
import { calculateMidpoint } from '../utils/midpoint';
import { track } from '../utils/analytics';
import { useSession } from '../utils/authClient';
import {
  claimPassport,
  deleteVisitedShop,
  pushVisitedShop,
} from '../utils/passportSync';
import {
  claimStarred,
  deleteStarredShop,
  pushStarredShop,
} from '../utils/starredSync';
import type { StarredShopSnapshot, VisitedShopSnapshot } from '../types';
import {
  searchCoffeeShops,
  SEARCH_RADIUS_MAX_M,
  SEARCH_RADIUS_MIN_M,
  SEARCH_RATING_MAX,
  SEARCH_RATING_MIN,
} from '../utils/places';

interface AppContextType extends AppState {
  setAddressA: (address: string) => void;
  setAddressB: (address: string) => void;
  addressA: string;
  addressB: string;
  findMeetupSpot: () => Promise<void>;
  toggleStar: (shop: CoffeeShop) => void;
  isStarred: (shopId: string) => boolean;
  addVisit: (shop: CoffeeShop) => void;
  removeVisited: (shopId: string) => void;
  isVisited: (shopId: string) => boolean;
  visitCount: (shopId: string) => number;
  lastVisit: (shopId: string) => number | null;
  setMapRef: (map: google.maps.Map | null) => void;
  setSelectedCoffeeShopId: (id: string | null) => void;
  setSearchMinRating: (value: number) => void;
  setSearchRadiusMeters: (value: number) => void;
  setSearchKeyword: (value: string) => void;
  setSearchPlaceCategory: (value: PlaceSearchCategory) => void;
  setSearchSortMode: (value: SearchSortMode) => void;
  setSearchOpenNow: (value: boolean) => void;
  updateStarredNote: (shopId: string, note: string) => void;
  addAddressTemplate: (address: string) => void;
  removeAddressTemplate: (address: string) => void;
  searchWithAddresses: (nextAddressA: string, nextAddressB: string) => Promise<void>;
  searchAround: (center: { lat: number; lng: number }) => Promise<void>;
  widenSearchParams: () => void;
  widenAndResearch: () => void;
  canWidenSearch: boolean;
  clearError: () => void;
}

const AppContext = createContext<AppContextType | null>(null);
const RECENT_SEARCHES_KEY = 'ACoffee-meetup-recent-searches';
const ADDRESS_TEMPLATES_KEY = 'ACoffee-meetup-address-templates';
const PLACE_CATEGORY_KEY = 'ACoffee-meetup-place-category';

function loadPlaceCategory(): PlaceSearchCategory {
  try {
    const raw = localStorage.getItem(PLACE_CATEGORY_KEY);
    if (raw === 'cafe' || raw === 'restaurant' || raw === 'lodging' || raw === 'bar') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'cafe';
}

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

const DEFAULT_MIN_RATING = 4;
const DEFAULT_RADIUS_M = 1200;
const DEFAULT_KEYWORD = 'coffee';
const DEFAULT_SORT_MODE: SearchSortMode = 'rating';

function initialFilter<T>(
  params: URLSearchParams,
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
): T {
  const raw = params.get(key);
  if (raw == null) return fallback;
  const parsed = parse(raw);
  return parsed === undefined ? fallback : parsed;
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
  const [addressA, setAddressA] = useState(() => {
    return new URLSearchParams(window.location.search).get('a') ?? '';
  });
  const [addressB, setAddressB] = useState(() => {
    return new URLSearchParams(window.location.search).get('b') ?? '';
  });
  const [locationA, setLocationA] = useState<Location | null>(null);
  const [locationB, setLocationB] = useState<Location | null>(null);
  const [midpoint, setMidpoint] = useState<{ lat: number; lng: number } | null>(null);
  const [rawShops, setRawShops] = useState<CoffeeShop[]>([]);
  const [selectedCoffeeShopId, setSelectedCoffeeShopIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMinRating, setSearchMinRating] = useState(() =>
    initialFilter(new URLSearchParams(window.location.search), 'mr', DEFAULT_MIN_RATING, (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) && n >= SEARCH_RATING_MIN && n <= SEARCH_RATING_MAX ? n : undefined;
    }),
  );
  const [searchRadiusMeters, setSearchRadiusMeters] = useState(() =>
    initialFilter(new URLSearchParams(window.location.search), 'r', DEFAULT_RADIUS_M, (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) && n >= SEARCH_RADIUS_MIN_M && n <= SEARCH_RADIUS_MAX_M
        ? Math.round(n)
        : undefined;
    }),
  );
  const [searchKeyword, setSearchKeyword] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get('q');
    return raw && raw.trim() ? raw : DEFAULT_KEYWORD;
  });
  const [searchPlaceCategory, setSearchPlaceCategoryState] = useState<PlaceSearchCategory>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('cat');
    if (fromUrl === 'cafe' || fromUrl === 'restaurant' || fromUrl === 'lodging' || fromUrl === 'bar') {
      return fromUrl;
    }
    return loadPlaceCategory();
  });
  const [searchSortMode, setSearchSortMode] = useState<SearchSortMode>(() => {
    const v = new URLSearchParams(window.location.search).get('sort');
    return v === 'fairness' || v === 'rating' ? v : DEFAULT_SORT_MODE;
  });
  const [searchOpenNow, setSearchOpenNow] = useState<boolean>(() => {
    return new URLSearchParams(window.location.search).get('open') === '1';
  });
  const [searchMode, setSearchMode] = useState<SearchMode>('meetup');
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(loadRecentSearches);
  const [addressTemplates, setAddressTemplates] = useState<string[]>(loadAddressTemplates);

  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  // Stores URL-derived search intent so the auto-search fires once after the map loads.
  // a+b → meetup search; near=lat,lng → nearby search.
  const pendingUrlSearch = useRef<
    | { kind: 'meetup'; a: string; b: string }
    | { kind: 'nearby'; lat: number; lng: number }
    | null
  >((() => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get('a')?.trim() ?? '';
    const b = params.get('b')?.trim() ?? '';
    if (a && b) return { kind: 'meetup', a, b };
    const near = params.get('near')?.trim() ?? '';
    if (near) {
      const [latStr, lngStr] = near.split(',');
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        return { kind: 'nearby', lat, lng };
      }
    }
    return null;
  })());

  const {
    starredShops,
    starredShopIds,
    toggleStar,
    updateStarredNote,
    replaceStarred,
    isStarred,
  } = useStarredShops();
  const {
    visitedShops,
    addVisit,
    removeVisited,
    replaceVisited,
    isVisited,
    visitCount,
    lastVisit,
  } = useVisitedShops();

  // Phase 0 cloud sync of the passport. Activates only when the auth flag is on
  // AND the user has a session. Anonymous behavior is unchanged (localStorage only).
  // Effect runs on session change (claim+merge once) and on visitedShops change
  // (diff against last-synced snapshot, push individual upsert/delete).
  const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';
  const { data: session, isPending: sessionLoading } = useSession();
  const sessionUserId =
    authEnabled && !sessionLoading && session?.user?.id ? session.user.id : null;
  const lastSyncedRef = useRef<VisitedShopSnapshot[] | null>(null);

  useEffect(() => {
    if (!sessionUserId) {
      // Logged out / disabled — reset, do nothing else.
      lastSyncedRef.current = null;
      return;
    }
    if (lastSyncedRef.current === null) {
      // First sync after login: claim merges localStorage with server, server returns canonical.
      let cancelled = false;
      void (async () => {
        const merged = await claimPassport(visitedShops);
        if (cancelled || merged == null) return;
        lastSyncedRef.current = merged;
        replaceVisited(merged);
      })();
      return () => {
        cancelled = true;
      };
    }
    // Steady state: diff against last-synced snapshot, push only what changed.
    const prev = lastSyncedRef.current;
    const prevById = new Map(prev.map((s) => [s.id, s]));
    const currById = new Map(visitedShops.map((s) => [s.id, s]));
    for (const id of prevById.keys()) {
      if (!currById.has(id)) deleteVisitedShop(id);
    }
    for (const [id, shop] of currById) {
      const prevShop = prevById.get(id);
      const changed =
        !prevShop ||
        prevShop.visits.length !== shop.visits.length ||
        (prevShop.visits[0] ?? 0) !== (shop.visits[0] ?? 0);
      if (changed) pushVisitedShop(shop);
    }
    lastSyncedRef.current = visitedShops;
  }, [visitedShops, sessionUserId, replaceVisited]);

  // Parallel sync for starred shops. Same state machine as visited (claim once on
  // session change, then diff-push on local changes), but change detection looks at
  // membership + note instead of visit count.
  const lastSyncedStarredRef = useRef<StarredShopSnapshot[] | null>(null);

  useEffect(() => {
    if (!sessionUserId) {
      lastSyncedStarredRef.current = null;
      return;
    }
    if (lastSyncedStarredRef.current === null) {
      let cancelled = false;
      void (async () => {
        const merged = await claimStarred(starredShops);
        if (cancelled || merged == null) return;
        lastSyncedStarredRef.current = merged;
        replaceStarred(merged);
      })();
      return () => {
        cancelled = true;
      };
    }
    const prev = lastSyncedStarredRef.current;
    const prevById = new Map(prev.map((s) => [s.id, s]));
    const currById = new Map(starredShops.map((s) => [s.id, s]));
    for (const id of prevById.keys()) {
      if (!currById.has(id)) deleteStarredShop(id);
    }
    for (const [id, shop] of currById) {
      const prevShop = prevById.get(id);
      const changed = !prevShop || prevShop.note !== shop.note;
      if (changed) pushStarredShop(shop);
    }
    lastSyncedStarredRef.current = starredShops;
  }, [starredShops, sessionUserId, replaceStarred]);

  // Re-sort reactively whenever shops, stars, or sort mode change — no re-search needed.
  const coffeeShops = useMemo(
    () => sortShops(rawShops, starredShopIds, searchSortMode),
    [rawShops, starredShopIds, searchSortMode]
  );

  const setSearchPlaceCategory = useCallback((value: PlaceSearchCategory) => {
    setSearchPlaceCategoryState(value);
    try {
      localStorage.setItem(PLACE_CATEGORY_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const setMapRef = useCallback((map: google.maps.Map | null) => {
    mapRef.current = map;
    if (map && !geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
    setIsMapReady(!!map);
  }, []);

  const setSelectedCoffeeShopId = useCallback((id: string | null) => {
    if (id) track('cafe_opened', { placeId: id });
    setSelectedCoffeeShopIdState(id);
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
      setSearchMode('meetup');
      setIsLoading(true);
      setError(null);
      setRawShops([]);
      setSelectedCoffeeShopIdState(null);
      track('search_submitted', { mode: 'meetup' });

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
          searchPlaceCategory,
          searchKeyword,
          searchOpenNow
        );
        setRawShops(shops);

        // Deep-link: if the URL named a specific café (?c=<placeId>) and it's
        // in this result set, highlight it. Use the raw state setter so the
        // auto-select doesn't fire cafe_opened (that event is for user clicks).
        const preselect = new URLSearchParams(window.location.search).get('c');
        if (preselect && shops.some((s) => s.id === preselect)) {
          setSelectedCoffeeShopIdState(preselect);
        }

        // Reflect the search in the URL so it can be bookmarked or shared.
        // Preserve filter params (r/mr/q/cat/sort) that the sync effect manages.
        const params = new URLSearchParams(window.location.search);
        params.set('a', a);
        params.set('b', b);
        params.delete('near');
        const newQuery = `?${params.toString()}`;
        if (newQuery !== window.location.search) {
          window.history.replaceState(
            {},
            '',
            `${window.location.pathname}${newQuery}${window.location.hash}`
          );
        }

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
    [searchMinRating, searchRadiusMeters, searchPlaceCategory, searchKeyword, searchOpenNow, t]
  );

  const findMeetupSpot = useCallback(async () => {
    if (!addressA.trim() || !addressB.trim()) {
      setError(t('errors.bothAddresses'));
      return;
    }
    await searchWithAddresses(addressA, addressB);
  }, [addressA, addressB, searchWithAddresses, t]);

  const searchAround = useCallback(
    async (center: { lat: number; lng: number }) => {
      if (!mapRef.current) {
        setError(t('errors.mapNotLoaded'));
        return;
      }

      setSearchMode('nearby');
      setAddressA('');
      setAddressB('');
      setLocationA(null);
      setLocationB(null);
      setMidpoint(center);
      setIsLoading(true);
      setError(null);
      setRawShops([]);
      setSelectedCoffeeShopIdState(null);
      track('search_submitted', { mode: 'nearby' });

      try {
        const { shops } = await searchCoffeeShops(
          mapRef.current,
          center,
          null,
          null,
          searchMinRating,
          searchRadiusMeters,
          searchPlaceCategory,
          searchKeyword,
          searchOpenNow
        );
        setRawShops(shops);

        const preselect = new URLSearchParams(window.location.search).get('c');
        if (preselect && shops.some((s) => s.id === preselect)) {
          setSelectedCoffeeShopIdState(preselect);
        }

        const params = new URLSearchParams(window.location.search);
        params.set('near', `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`);
        params.delete('a');
        params.delete('b');
        const newQuery = `?${params.toString()}`;
        if (newQuery !== window.location.search) {
          window.history.replaceState(
            {},
            '',
            `${window.location.pathname}${newQuery}${window.location.hash}`
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t('errors.generic'));
      } finally {
        setIsLoading(false);
      }
    },
    [searchMinRating, searchRadiusMeters, searchPlaceCategory, searchKeyword, searchOpenNow, t]
  );

  // Auto-search from URL params once the map instance is ready.
  useEffect(() => {
    if (!isMapReady || !pendingUrlSearch.current) return;
    const pending = pendingUrlSearch.current;
    pendingUrlSearch.current = null;
    if (pending.kind === 'meetup') {
      void searchWithAddresses(pending.a, pending.b);
    } else {
      void searchAround({ lat: pending.lat, lng: pending.lng });
    }
  }, [isMapReady, searchWithAddresses, searchAround]);

  // Reflect filter state in URL so bookmarked/shared links carry the same
  // radius / rating / keyword / category / sort. Only non-default values
  // are written; a/b and near params are preserved as-is.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string, isDefault: boolean) => {
      if (isDefault) params.delete(key);
      else params.set(key, value);
    };
    setOrDelete('r', String(searchRadiusMeters), searchRadiusMeters === DEFAULT_RADIUS_M);
    setOrDelete('mr', String(searchMinRating), searchMinRating === DEFAULT_MIN_RATING);
    setOrDelete('q', searchKeyword, searchKeyword === DEFAULT_KEYWORD);
    setOrDelete('cat', searchPlaceCategory, searchPlaceCategory === 'cafe');
    setOrDelete('sort', searchSortMode, searchSortMode === DEFAULT_SORT_MODE);
    setOrDelete('open', '1', !searchOpenNow);
    const query = params.toString();
    const target = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState({}, '', target);
    }
  }, [searchRadiusMeters, searchMinRating, searchKeyword, searchPlaceCategory, searchSortMode, searchOpenNow]);

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

  // One-click recovery from an empty result set: widen the params AND
  // re-run the last search. We can't just call findMeetupSpot/searchAround
  // synchronously after the setters because those callbacks close over
  // the *previous* radius/rating. The pending flag defers the re-search
  // to the next render, where the search closures carry the new values.
  const [pendingWidenResearch, setPendingWidenResearch] = useState(false);

  const widenAndResearch = useCallback(() => {
    widenSearchParams();
    setPendingWidenResearch(true);
  }, [widenSearchParams]);

  useEffect(() => {
    if (!pendingWidenResearch) return;
    setPendingWidenResearch(false);
    if (searchMode === 'nearby' && midpoint) {
      void searchAround(midpoint);
    } else if (addressA.trim() && addressB.trim()) {
      void findMeetupSpot();
    }
  }, [pendingWidenResearch, searchMode, midpoint, addressA, addressB, searchAround, findMeetupSpot]);

  const canWidenSearch =
    searchRadiusMeters < SEARCH_RADIUS_MAX_M || searchMinRating > SEARCH_RATING_MIN;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AppContextType>(
    () => ({
      locationA,
      locationB,
      midpoint,
      coffeeShops,
      selectedCoffeeShopId,
      starredShops,
      visitedShops,
      isLoading,
      error,
      searchMinRating,
      searchRadiusMeters,
      searchKeyword,
      searchPlaceCategory,
      searchSortMode,
      searchMode,
      searchOpenNow,
      setSearchOpenNow,
      recentSearches,
      addressTemplates,
      addressA,
      addressB,
      setAddressA,
      setAddressB,
      setSearchMinRating,
      setSearchRadiusMeters,
      setSearchKeyword,
      setSearchPlaceCategory,
      setSearchSortMode,
      widenSearchParams,
      widenAndResearch,
      canWidenSearch,
      clearError,
      findMeetupSpot,
      searchWithAddresses,
      searchAround,
      toggleStar,
      updateStarredNote,
      addAddressTemplate,
      removeAddressTemplate,
      isStarred,
      addVisit,
      removeVisited,
      isVisited,
      visitCount,
      lastVisit,
      setMapRef,
      setSelectedCoffeeShopId,
    }),
    [
      locationA,
      locationB,
      midpoint,
      coffeeShops,
      selectedCoffeeShopId,
      starredShops,
      visitedShops,
      isLoading,
      error,
      searchMinRating,
      searchRadiusMeters,
      searchKeyword,
      searchPlaceCategory,
      searchSortMode,
      searchMode,
      searchOpenNow,
      recentSearches,
      addressTemplates,
      addressA,
      addressB,
      setSearchPlaceCategory,
      widenSearchParams,
      widenAndResearch,
      canWidenSearch,
      clearError,
      findMeetupSpot,
      searchWithAddresses,
      searchAround,
      toggleStar,
      updateStarredNote,
      addAddressTemplate,
      removeAddressTemplate,
      isStarred,
      addVisit,
      removeVisited,
      isVisited,
      visitCount,
      lastVisit,
      setMapRef,
      setSelectedCoffeeShopId,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
