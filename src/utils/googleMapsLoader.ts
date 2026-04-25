/**
 * Single source of truth for the Google Maps SDK libraries we depend on.
 * Both the visible map components (Map, TrajectoryMap) and AppProvider call
 * `useJsApiLoader` — `@react-google-maps/api` dedupes via an internal
 * singleton as long as every caller passes the same libraries array (a
 * reference-stable module-scoped constant — array contents are normalised
 * to a comma-separated query string on the script tag).
 */
export const GOOGLE_MAPS_LIBRARIES: ('places' | 'marker')[] = ['places', 'marker'];
