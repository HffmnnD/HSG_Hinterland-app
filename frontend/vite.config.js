import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' als Prefix: auch Variablen ohne VITE_ (z. B. API_PROXY_TARGET) laden.
  const env = loadEnv(mode, '.', '')
  // Ziel des Dev-Proxys. Standard: lokales Backend.
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:5000'

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'HSG Hinterland App',
          short_name: 'HSG Hinterland',
          description: 'Vereins-App der HSG Hinterland',
          lang: 'de',
          theme_color: '#2e2e2e',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          // API-Antworten niemals cachen – sonst liefert der Service Worker
          // veraltete Auth-/Rollendaten aus.
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    server: {
      // Im LAN erreichbar, damit die PWA auch vom Handy getestet werden kann.
      host: true,
      // Frontend und API laufen dadurch über dieselbe Origin: kein CORS und
      // keine Cross-Site-Cookie-Probleme (auch beim Testen über die LAN-IP).
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
  }
})
