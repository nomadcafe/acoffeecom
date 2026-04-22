import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'robots.txt'],
      manifest: {
        name: 'ACoffee — Coffee Meetup Finder',
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
            urlPattern: /^https:\/\/ipapi\.co\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ip-location',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
})
