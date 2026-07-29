import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/EAFIT/',
  test: {
    setupFiles: ['./src/test/setupTests.js'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        globIgnores: ['landing/**'],
      },
      includeAssets: ['icon.svg', 'favicon.svg', 'favicon.ico'],
      manifest: {
        name: 'EAFIT - Treino',
        short_name: 'EAFIT',
        description: 'Seu plano de treino personalizado',
        start_url: '/EAFIT/',
        scope: '/EAFIT/',
        display: 'standalone',
        background_color: '#0e0e12',
        theme_color: '#0e0e12',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
