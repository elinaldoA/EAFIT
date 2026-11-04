import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/admin/',
  server: {
    port: 5174,
    // lib/exerciseMedia.js lê o mapeamento de demonstrações padrão do app-react
    fs: { allow: ['..'] },
  },
  test: {
    setupFiles: ['./src/test/setupTests.js'],
    // Telas com mapa/SVG pesado estouravam os 5s padrão quando a máquina (ou o CI) está carregada.
    testTimeout: 20000,
  },
  plugins: [react()],
})
