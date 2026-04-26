import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
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
import { GOOGLE_MAPS_LIBRARIES } from '../utils/googleMapsLoader';
import {
  claimPassport,
  deleteVisitedShop,
  pullVisited,
  pushVisitedShopWire,
  toWire as visitedToWire,
  type VisitedShopWire,
} from '../utils/passportSync';
import {
  claimStarred,
  deleteStarredShop,
  pullStarred,
  pushStarredShopWire,
  toWire as starredToWire,
  type StarredShopWire,
} from '../utils/starredSync';
import {
  drain as drainQueue,
  enqueue as enqueueMutation,
  subscribeSize as subscribeQueueSize,
  type QueueEntry,
} from '../utils/syncQueue';
import { mergeRemoteStarred, mergeRemoteVisited } from '../utils/syncMerge';
import type { StarredShopSnapshot, VisitedShopSnapshot } from '../types';
import {
  searchCoffeeShops,
  SEARCH_RADIUS_MAX_M,
  SEARCH_RADIUS_MIN_M,
  SEARCH_RATING_MAX,
  SEARCH_RATING_MIN,
} from '../utils/places';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AppContextType extends AppState {
  syncStatus: SyncStatus;
  /** Pending mutations sitting in the IndexedDB queue (offline-buffered or in backoff). */
  syncPending: number;
  /** Google Maps SDK loaded — single source of truth so consumers (Map,
   *  TrajectoryMap) don't each call useJsApiLoader and risk desync. */
  isSdkLoaded: boolean;
  /** Surface load failures so visible map components can show an error. */
  sdkLoadError: Error | undefined;
  setAddressA: (address: string) => void;
  setAddressB: (address: string) => void;
  addressA: string;
  addressB: string;
  findMeetupSpot: () => Promise<void>;
  toggleStar: (shop: CoffeeShop) => void;
  isStarred: (shopId: string) => boolean;
  addVisit: (shop: CoffeeShop) => void;
  removeVisited: (shopId: string) => void;
  removeVisitAt: (shopId: string, ts: number) => void;
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
  /** Reset locations / midpoint / results / address inputs back to a fresh
   *  home state. Saved and visited shops and search settings are preserved. */
  clearSearch: () => void;
}

const AppContext = createContext<AppContextType | null>(null);
const RECENT_SEARCHES_KEY = 'ACoffee-meetup-recent-searches';
const ADDRESS_TEMPLATES_KEY = 'ACoffee-meetup-address-templates';
const PLACE_CATEGORY_KEY = 'ACoffee-meetup-place-category';
/** Scoped per user — cursor from one account makes no sense for another. */
const PULL_CURSOR_KEY = (stream: 'visited' | 'starred', userId: string) =>
  `ACoffee-meetup-pull-cursor-${stream}-${userId}`;

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
  // Boot the Maps SDK at the provider level so autocomplete + geocoding +
  // Place.searchNearby are all usable before (and independent of) the
  // visible <Map> mounting. Without this, the pre-search inline layout has
  // no SDK loaded → autocomplete stays empty and any kicked-off search
  // dies with 'Map not loaded yet'.
  const { isLoaded: isSdkLoaded, loadError: sdkLoadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Geocoder needs the SDK loaded but doesn't need a map instance, so
  // create it as soon as the SDK is ready. Search functions check this ref
  // (not mapRef) before running.
  useEffect(() => {
    if (isSdkLoaded && !geocoderRef.current) {
      geocoderRef.current = new google.maps.Geocoder();
    }
  }, [isSdkLoaded]);
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
    removeVisitAt,
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
  // Declared up front (paired with lastSyncedRef) so pullAndMerge below can
  // see both without forward references.
  const lastSyncedStarredRef = useRef<StarredShopSnapshot[] | null>(null);

  // Sync status: aggregates passport + starred sync activity. `inFlight` counts
  // concurrent ops; `idleTimer` clears the visible 'synced'/'error' badge after
  // a short delay so the indicator doesn't get stuck.
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncPending, setSyncPending] = useState<number>(0);
  const inFlightRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);

  // Subscribe to queue size so the indicator can show "N waiting" badges.
  useEffect(() => subscribeQueueSize(setSyncPending), []);

  const cancelIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const beginSync = useCallback(() => {
    inFlightRef.current += 1;
    cancelIdleTimer();
    setSyncStatus('syncing');
  }, [cancelIdleTimer]);

  const endSync = useCallback(
    (ok: boolean) => {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      if (inFlightRef.current > 0) {
        if (!ok) setSyncStatus('error');
        return;
      }
      const next: SyncStatus = ok ? 'synced' : 'error';
      setSyncStatus(next);
      cancelIdleTimer();
      idleTimerRef.current = window.setTimeout(
        () => {
          if (inFlightRef.current === 0) setSyncStatus('idle');
          idleTimerRef.current = null;
        },
        ok ? 2000 : 8000,
      );
    },
    [cancelIdleTimer],
  );

  // Reset on sign-out so the badge doesn't linger from a previous session.
  useEffect(() => {
    if (sessionUserId) return;
    cancelIdleTimer();
    inFlightRef.current = 0;
    setSyncStatus('idle');
  }, [sessionUserId, cancelIdleTimer]);

  useEffect(() => () => cancelIdleTimer(), [cancelIdleTimer]);

  // Queue handler for one mutation entry. Returns true if the API accepted it
  // (so the queue can drop the entry); false leaves it for the next drain.
  const runMutation = useCallback(async (entry: QueueEntry): Promise<boolean> => {
    if (entry.op === 'upsert') {
      if (entry.kind === 'visited') return pushVisitedShopWire(entry.payload as VisitedShopWire);
      if (entry.kind === 'starred') return pushStarredShopWire(entry.payload as StarredShopWire);
    }
    if (entry.op === 'delete') {
      if (entry.kind === 'visited') return deleteVisitedShop(entry.placeId, entry.ts);
      if (entry.kind === 'starred') return deleteStarredShop(entry.placeId, entry.ts);
    }
    return false;
  }, []);

  // Drain pending mutations against the API. Wraps beginSync/endSync so the
  // SyncIndicator reflects flush activity. Idempotent — safe to call repeatedly.
  const flushQueue = useCallback(async () => {
    if (!sessionUserId) return;
    beginSync();
    try {
      const { failed } = await drainQueue(runMutation);
      endSync(failed === 0);
    } catch {
      endSync(false);
    }
  }, [sessionUserId, beginSync, endSync, runMutation]);

  // Cross-device pull: keep latest cursor + current state in refs so
  // pullAndMerge doesn't need to depend on shifting visitedShops/starredShops
  // (avoids re-binding visibility/online listeners on every state change).
  const pullCursorVisitedRef = useRef<number>(0);
  const pullCursorStarredRef = useRef<number>(0);
  const pullInFlightRef = useRef<boolean>(false);
  const visitedShopsRef = useRef(visitedShops);
  visitedShopsRef.current = visitedShops;
  const starredShopsRef = useRef(starredShops);
  starredShopsRef.current = starredShops;

  // Load cursors when a session attaches; clear when it detaches.
  useEffect(() => {
    if (!sessionUserId) {
      pullCursorVisitedRef.current = 0;
      pullCursorStarredRef.current = 0;
      return;
    }
    try {
      const v = Number(localStorage.getItem(PULL_CURSOR_KEY('visited', sessionUserId)));
      const s = Number(localStorage.getItem(PULL_CURSOR_KEY('starred', sessionUserId)));
      pullCursorVisitedRef.current = Number.isFinite(v) && v > 0 ? v : 0;
      pullCursorStarredRef.current = Number.isFinite(s) && s > 0 ? s : 0;
    } catch {
      /* ignore */
    }
  }, [sessionUserId]);

  /**
   * Pull updates from other devices, merge into local state, advance cursor.
   * Drains the queue first so our pending writes get to the server before we
   * potentially overwrite local with the server's view. Single-flight per
   * call — overlapping triggers (visibility + online firing close together)
   * collapse to one network round trip.
   */
  const pullAndMerge = useCallback(async () => {
    if (!sessionUserId) return;
    if (pullInFlightRef.current) return;
    pullInFlightRef.current = true;
    beginSync();
    try {
      await drainQueue(runMutation);
      const [vRes, sRes] = await Promise.all([
        pullVisited(pullCursorVisitedRef.current),
        pullStarred(pullCursorStarredRef.current),
      ]);
      if (vRes && vRes.shops.length > 0) {
        const next = mergeRemoteVisited(visitedShopsRef.current, vRes.shops);
        // Set the synced ref BEFORE state update so the diff effect sees no
        // change and doesn't re-enqueue what we just received.
        lastSyncedRef.current = next;
        replaceVisited(next);
      }
      if (vRes) {
        pullCursorVisitedRef.current = vRes.cursor;
        try {
          localStorage.setItem(PULL_CURSOR_KEY('visited', sessionUserId), String(vRes.cursor));
        } catch {
          /* ignore */
        }
      }
      if (sRes && sRes.shops.length > 0) {
        const next = mergeRemoteStarred(starredShopsRef.current, sRes.shops);
        lastSyncedStarredRef.current = next;
        replaceStarred(next);
      }
      if (sRes) {
        pullCursorStarredRef.current = sRes.cursor;
        try {
          localStorage.setItem(PULL_CURSOR_KEY('starred', sessionUserId), String(sRes.cursor));
        } catch {
          /* ignore */
        }
      }
      endSync(vRes != null && sRes != null);
    } catch {
      endSync(false);
    } finally {
      pullInFlightRef.current = false;
    }
    // lastSyncedStarredRef is declared further down; this callback captures
    // them by reference at call time (refs, not state) so order is fine.
  }, [sessionUserId, beginSync, endSync, runMutation, replaceVisited, replaceStarred]);

  useEffect(() => {
    if (!sessionUserId) {
      // Logged out / disabled — reset, do nothing else.
      lastSyncedRef.current = null;
      return;
    }
    if (lastSyncedRef.current === null) {
      // First sync after login: drain any pending offline mutations first so
      // local-only changes get to the server with their original timestamps,
      // *then* claim merges everything else and the server returns canonical.
      let cancelled = false;
      beginSync();
      void (async () => {
        await drainQueue(runMutation);
        const result = await claimPassport(visitedShops);
        if (cancelled) return;
        if (result == null) {
          endSync(false);
          return;
        }
        lastSyncedRef.current = result.shops;
        replaceVisited(result.shops);
        // Cursor seeds the delta-pull so subsequent visibility changes only
        // fetch what other devices added after this moment.
        pullCursorVisitedRef.current = result.cursor;
        try {
          localStorage.setItem(PULL_CURSOR_KEY('visited', sessionUserId), String(result.cursor));
        } catch {
          /* ignore */
        }
        endSync(true);
      })();
      return () => {
        cancelled = true;
      };
    }
    // Steady state: diff against last-synced snapshot, enqueue only what changed.
    // Direct fetches were brittle when offline; the queue retries on reconnect.
    const prev = lastSyncedRef.current;
    const prevById = new Map(prev.map((s) => [s.id, s]));
    const currById = new Map(visitedShops.map((s) => [s.id, s]));
    let pending = 0;
    for (const id of prevById.keys()) {
      if (!currById.has(id)) {
        pending++;
        void enqueueMutation({ kind: 'visited', op: 'delete', placeId: id, ts: Date.now() });
      }
    }
    for (const [id, shop] of currById) {
      const prevShop = prevById.get(id);
      const changed =
        !prevShop ||
        prevShop.updatedAt !== shop.updatedAt ||
        prevShop.visits.length !== shop.visits.length;
      if (changed) {
        pending++;
        void enqueueMutation({
          kind: 'visited',
          op: 'upsert',
          placeId: id,
          payload: visitedToWire(shop),
        });
      }
    }
    lastSyncedRef.current = visitedShops;
    if (pending > 0) void flushQueue();
  }, [visitedShops, sessionUserId, replaceVisited, beginSync, endSync, runMutation, flushQueue]);

  // Parallel sync for starred shops. Same state machine as visited (claim once on
  // session change, then diff-push on local changes), but change detection looks at
  // membership + note instead of visit count.
  useEffect(() => {
    if (!sessionUserId) {
      lastSyncedStarredRef.current = null;
      return;
    }
    if (lastSyncedStarredRef.current === null) {
      let cancelled = false;
      beginSync();
      void (async () => {
        await drainQueue(runMutation);
        const result = await claimStarred(starredShops);
        if (cancelled) return;
        if (result == null) {
          endSync(false);
          return;
        }
        lastSyncedStarredRef.current = result.shops;
        replaceStarred(result.shops);
        pullCursorStarredRef.current = result.cursor;
        try {
          localStorage.setItem(PULL_CURSOR_KEY('starred', sessionUserId), String(result.cursor));
        } catch {
          /* ignore */
        }
        endSync(true);
      })();
      return () => {
        cancelled = true;
      };
    }
    const prev = lastSyncedStarredRef.current;
    const prevById = new Map(prev.map((s) => [s.id, s]));
    const currById = new Map(starredShops.map((s) => [s.id, s]));
    let pending = 0;
    for (const id of prevById.keys()) {
      if (!currById.has(id)) {
        pending++;
        void enqueueMutation({ kind: 'starred', op: 'delete', placeId: id, ts: Date.now() });
      }
    }
    for (const [id, shop] of currById) {
      const prevShop = prevById.get(id);
      const changed = !prevShop || prevShop.updatedAt !== shop.updatedAt;
      if (changed) {
        pending++;
        void enqueueMutation({
          kind: 'starred',
          op: 'upsert',
          placeId: id,
          payload: starredToWire(shop),
        });
      }
    }
    lastSyncedStarredRef.current = starredShops;
    if (pending > 0) void flushQueue();
  }, [starredShops, sessionUserId, replaceStarred, beginSync, endSync, runMutation, flushQueue]);

  // Drain queue + pull cross-device updates on connectivity / visibility
  // changes. pullAndMerge already drains internally, so we only need to call
  // it (it's single-flight, so close-together visibility+online events
  // collapse to one round trip).
  useEffect(() => {
    if (!sessionUserId) return;
    const onResume = () => {
      if (document.visibilityState === 'visible') void pullAndMerge();
    };
    const onOnline = () => void pullAndMerge();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [sessionUserId, pullAndMerge]);

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

      if (!geocoderRef.current) {
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
        const raw = e instanceof Error ? e.message : '';
        // places.ts throws this sentinel for DNS / connection failures so
        // we can surface a clearer "check your VPN" message instead of the
        // raw RPC error text.
        if (raw === 'NETWORK_UNREACHABLE') {
          setError(t('errors.network'));
        } else {
          setError(raw || t('errors.generic'));
        }
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
      if (!isSdkLoaded) {
        setError(t('errors.mapNotLoaded'));
        return;
      }

      setSearchMode('nearby');
      // Fairness sort needs an A and a B to balance — pointless in nearby
      // mode, so fall back to rating sort if the user had it on.
      setSearchSortMode((s) => (s === 'fairness' ? 'rating' : s));
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
        const raw = e instanceof Error ? e.message : '';
        // places.ts throws this sentinel for DNS / connection failures so
        // we can surface a clearer "check your VPN" message instead of the
        // raw RPC error text.
        if (raw === 'NETWORK_UNREACHABLE') {
          setError(t('errors.network'));
        } else {
          setError(raw || t('errors.generic'));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isSdkLoaded, searchMinRating, searchRadiusMeters, searchPlaceCategory, searchKeyword, searchOpenNow, t]
  );

  // Auto-search from URL params once the SDK is loaded. Used to wait for
  // the visible map to mount; now decoupled so the geocoder + Place
  // search can fire as soon as the script is ready.
  useEffect(() => {
    if (!isSdkLoaded || !pendingUrlSearch.current) return;
    const pending = pendingUrlSearch.current;
    pendingUrlSearch.current = null;
    if (pending.kind === 'meetup') {
      void searchWithAddresses(pending.a, pending.b);
    } else {
      void searchAround({ lat: pending.lat, lng: pending.lng });
    }
  }, [isSdkLoaded, searchWithAddresses, searchAround]);

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

  /**
   * Reset search-only state (locations, midpoint, results, address inputs)
   * without touching saved/visited shops or filter settings. Called when the
   * user navigates back to a "fresh home" — e.g., taps the logo from a page
   * that already has search results — so the URL change actually translates
   * into a visible change.
   */
  const clearSearch = useCallback(() => {
    setLocationA(null);
    setLocationB(null);
    setMidpoint(null);
    setRawShops([]);
    setSelectedCoffeeShopIdState(null);
    setAddressA('');
    setAddressB('');
    setError(null);
    setIsLoading(false);
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
      syncStatus,
      syncPending,
      isSdkLoaded,
      sdkLoadError,
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
      clearSearch,
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
      removeVisitAt,
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
      syncStatus,
      syncPending,
      isSdkLoaded,
      sdkLoadError,
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
      clearSearch,
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
      removeVisitAt,
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
