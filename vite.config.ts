import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks so app-code-only deploys don't bust the
        // browser cache for React / Maps SDK / Better Auth — these update
        // far less often than our own files.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('@react-google-maps')) return 'maps';
          if (id.includes('better-auth') || id.includes('@better-auth')) return 'auth';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'robots.txt'],
      manifest: {
        name: 'ACoffee — Best Meetup Place Finder',
        short_name: 'ACoffee',
        description:
          'Find highly-rated coffee shops near the midpoint between two places, or near you.',
        theme_color: '#2c1810',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['lifestyle', 'travel', 'food'],
        icons: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Don't intercept Google Maps / Places API requests — they must always hit the network.
        navigateFallbackDenylist: [/^\/api\//, /^\/_/],
        /* Trim the precache to first-paint essentials. Without this filter
         * the SW eagerly downloads every route chunk (Account, Bookings,
         * Passport, etc.) AND all three locale bundles on first visit —
         * ~600KB of bytes most users never touch. We keep:
         *   - the entry chunk + react/maps/auth vendor chunks
         *   - global CSS
         *   - HomeFeatureShowcase / AppHero (visible on first paint)
         *   - logo + manifest + favicon
         * Anything else is fetched on demand and runtime-cached
         * via the navigation handler. Locale bundles in particular are
         * loaded by the i18n loader as needed; the SW would just
         * duplicate that with eager downloads. */
        globIgnores: [
          // All route-page chunks except home/showcase
          '**/AccountPage-*.js',
          '**/BookingsPage-*.js',
          '**/PassportPage-*.js',
          '**/UpdateLogPage-*.js',
          '**/ProposalPage-*.js',
          '**/PublicProfilePage-*.js',
          '**/CancelBookingPage-*.js',
          '**/ConfirmBookingPage-*.js',
          // Locale chunks — i18n loads them on demand
          '**/en-*.js',
          '**/ja-*.js',
          '**/zh-*.js',
        ],
        runtimeCaching: [
          {
            // Always hit network for IP location — caching it means a stale
            // location follows the user when they move to a new place.
            urlPattern: /^https:\/\/ipapi\.co\//,
            handler: 'NetworkOnly',
          },
          /* Demand-cache the chunks we excluded from precache so a
           * second navigation to the same route is still instant. SW
           * fetches them once, then serves from cache. */
          {
            urlPattern: /\/assets\/(AccountPage|BookingsPage|PassportPage|UpdateLogPage|ProposalPage|PublicProfilePage|CancelBookingPage|ConfirmBookingPage|en|ja|zh)-[^/]+\.js$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'route-chunks-v1',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})
