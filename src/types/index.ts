export interface Location {
  address: string;
  lat: number;
  lng: number;
}

export interface CoffeeShop {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  userRatingsTotal: number;
  distanceFromA?: number;
  distanceFromB?: number;
  /** Optional third party — set when the trip card has 3 addresses. */
  distanceFromC?: number;
  /** Travel times in seconds, populated when the Routes API succeeded.
   *  When all parties have a duration the cards switch from "1.2 km"
   *  to "18 min" and the fairness sort uses minutes instead of km. */
  durationFromA?: number;
  durationFromB?: number;
  durationFromC?: number;
  /** Straight-line distance from the A–B midpoint (same point used as the Places search center). */
  distanceFromMidpoint?: number;
  isOpen?: boolean;
  /** From Places (New) `googleMapsURI` when requested; preferred for “open in Maps”. */
  googleMapsUri?: string;
  /** 0 = free, 1 = inexpensive, 2 = moderate, 3 = expensive, 4 = very expensive.
   *  Undefined when Places didn't surface a level for this venue. Used by the
   *  "Cheap" agent mode to filter out higher-tier spots. */
  priceLevel?: number;
}

/** Persisted when user stars a shop so the sidebar can list favorites without a new search. */
export interface StarredShopSnapshot {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  googleMapsUri?: string;
  note?: string;
  /** ms — last local mutation. LWW key for cloud sync. Filled on read for legacy records. */
  updatedAt: number;
}

/** Persisted when user marks a shop as visited — powers the "Coffee Passport" count + list. */
export interface VisitedShopSnapshot {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  googleMapsUri?: string;
  /** Ordered newest-first list of visit timestamps (ms). A passport-style stamp log. */
  visits: number[];
  /** Per-visit short notes keyed by ts. Sparse — only visits that have a note appear. */
  visitNotes?: Record<string, string>;
  /** Per-visit 1–5 star ratings keyed by ts. Sparse — unrated visits are absent.
   *  Stored separately from notes so a visit can have a rating without a note
   *  (and a tagless rating doesn't force the note column to grow). */
  visitRatings?: Record<string, number>;
  /** Derived from `address` via extractCity(); lazily backfilled on load for older records. */
  city?: string;
  /** ms — last local mutation. LWW key for cloud sync. Filled on read for legacy records. */
  updatedAt: number;
}

export type SearchSortMode = 'rating' | 'fairness' | 'fast' | 'quiet' | 'cheap';

/**
 * "Agent mode" — six presets the user picks instead of fiddling with
 * sort/filter knobs. Each preset bundles a sort mode and a couple of
 * filter tweaks; the user can still override anything in the
 * advanced filter panel afterwards.
 */
export type AgentMode = 'fair' | 'fast' | 'vibe' | 'quiet' | 'cheap' | 'now';

/** 'meetup' = A+B midpoint search; 'nearby' = single-point search around the user. */
export type SearchMode = 'meetup' | 'nearby';

/** Nearby search primary-type group (Maps Places API). Default is cafés for coffee meetups. */
export type PlaceSearchCategory = 'cafe' | 'restaurant' | 'lodging' | 'bar';

export const PLACE_SEARCH_CATEGORIES: PlaceSearchCategory[] = [
  'cafe',
  'restaurant',
  'lodging',
  'bar',
];

export interface RecentSearchItem {
  id: string;
  addressA: string;
  addressB: string;
  /** Optional 3rd address. Older entries (pre-multi-party) omit this — read
   *  paths must treat missing as "two-person search" for backwards compat. */
  addressC?: string;
  createdAt: number;
}

export interface AppState {
  locationA: Location | null;
  locationB: Location | null;
  /** Optional third party. Null when the trip is a 2-person search. */
  locationC: Location | null;
  midpoint: { lat: number; lng: number } | null;
  coffeeShops: CoffeeShop[];
  /** Highlights a shop on the map and list; null when nothing is selected. */
  selectedCoffeeShopId: string | null;
  starredShops: StarredShopSnapshot[];
  visitedShops: VisitedShopSnapshot[];
  isLoading: boolean;
  error: string | null;
  /** Minimum star rating filter (typical Google scale ~1–5). */
  searchMinRating: number;
  /** Places search radius in meters, centered on the A–B midpoint (not on each address). */
  searchRadiusMeters: number;
  /** Optional name filter when place category is cafés. */
  searchKeyword: string;
  /** What to search around the midpoint (default cafés). */
  searchPlaceCategory: PlaceSearchCategory;
  /** Sort strategy for result cards. */
  searchSortMode: SearchSortMode;
  /** Meetup (A+B) vs nearby (single-point) search mode. */
  searchMode: SearchMode;
  /** When true, hide results that are not currently open. */
  searchOpenNow: boolean;
  recentSearches: RecentSearchItem[];
  addressTemplates: string[];
}
