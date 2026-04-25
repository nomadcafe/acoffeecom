import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

// In dev (`wrangler pages dev`) Pages Functions and the SPA share the same
// origin, so an empty baseURL works (relative requests). In production we're
// also same-origin. Override via VITE_AUTH_BASE_URL only for cross-origin setups
// (e.g. Storybook hitting a deployed API).
const baseURL = import.meta.env.VITE_AUTH_BASE_URL ?? undefined;

export const authClient = createAuthClient({
  baseURL,
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
