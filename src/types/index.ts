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
  photoUrl?: string;
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

export type SearchSortMode = 'rating' | 'fairness';

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
  isLoading: boolean;
  error: string | null;
  /** Minimum star rating filter (typical Google scale ~1–5). */
  searchMinRating: number;
  /** Places search radius in meters, centered on the A–B midpoint (not on each address). */
  searchRadiusMeters: number;
  /** Places `keyword`; empty string falls back to `coffee` in the API layer. */
  searchKeyword: string;
  /** Sort strategy for result cards. */
  searchSortMode: SearchSortMode;
  recentSearches: RecentSearchItem[];
  addressTemplates: string[];
}
