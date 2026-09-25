import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/EAFIT/admin/',
  server: {
    port: 5174,
    // lib/exerciseMedia.js lê o mapeamento de demonstrações padrão do app-react
    fs: { allow: ['..'] },
  },
  test: {
    setupFiles: ['./src/test/setupTests.js'],
  },
  plugins: [react()],
})
