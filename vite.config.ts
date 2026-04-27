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
        runtimeCaching: [
          {
            // Always hit network for IP location — caching it means a stale
            // location follows the user when they move to a new place.
            urlPattern: /^https:\/\/ipapi\.co\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
