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

export interface AppState {
  locationA: Location | null;
  locationB: Location | null;
  midpoint: { lat: number; lng: number } | null;
  coffeeShops: CoffeeShop[];
  /** Highlights a shop on the map and list; null when nothing is selected. */
  selectedCoffeeShopId: string | null;
  starredShopIds: string[];
  isLoading: boolean;
  error: string | null;
  /** Minimum star rating filter (typical Google scale ~1–5). */
  searchMinRating: number;
  /** Places search radius in meters, centered on the A–B midpoint (not on each address). */
  searchRadiusMeters: number;
  /** Places `keyword`; empty string falls back to `coffee` in the API layer. */
  searchKeyword: string;
}
