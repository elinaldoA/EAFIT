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
        // og-image.png só é lida por crawlers de prévia de link (WhatsApp,
        // redes sociais), nunca pelo app — não precisa ir pro precache.
        globIgnores: ['landing/**', 'og-image.png'],
      },
      includeAssets: ['icon.svg', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        id: '/EAFIT/',
        name: 'EAFIT — Treino',
        short_name: 'EAFIT',
        description: 'Plano de treino personalizado, registro de cargas e recordes, hidratação e evolução — funciona offline.',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['health', 'fitness', 'lifestyle'],
        start_url: '/EAFIT/',
        scope: '/EAFIT/',
        display: 'standalone',
        background_color: '#0e0e12',
        theme_color: '#0e0e12',
        orientation: 'portrait',
        // `any` e `maskable` em arquivos separados: o mesmo PNG servindo os
        // dois faz o Android recortar o quadrado arredondado do ícone `any`.
        // Os maskable têm fundo contínuo e a figura dentro da zona segura
        // (círculo central de 80%).
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Atalhos do ícone instalado (toque longo) — abrem direto na aba,
        // via hash (ver hooks/useHashTab.js).
        shortcuts: [
          { name: 'Treino de hoje', short_name: 'Treino', url: '/EAFIT/#treino', icons: [{ src: 'icon-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Histórico de treinos', short_name: 'Histórico', url: '/EAFIT/#historico', icons: [{ src: 'icon-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Registrar água', short_name: 'Água', url: '/EAFIT/#hidratacao', icons: [{ src: 'icon-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Minha evolução', short_name: 'Evolução', url: '/EAFIT/#dash', icons: [{ src: 'icon-96.png', sizes: '96x96', type: 'image/png' }] },
        ],
      },
    }),
  ],
})
