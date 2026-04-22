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
  /** Straight-line distance from the A–B midpoint (same point used as the Places search center). */
  distanceFromMidpoint?: number;
  isOpen?: boolean;
  /** From Places (New) `googleMapsURI` when requested; preferred for “open in Maps”. */
  googleMapsUri?: string;
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
}

export type SearchSortMode = 'rating' | 'fairness';

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
  createdAt: number;
}

export interface AppState {
  locationA: Location | null;
  locationB: Location | null;
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
