/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** Build-time flag: when 'true', Phase 0 auth UI + passport sync activate. Default off. */
  readonly VITE_AUTH_ENABLED?: string;
  /** Override Better Auth client baseURL. Defaults to same-origin (recommended). */
  readonly VITE_AUTH_BASE_URL?: string;
}
