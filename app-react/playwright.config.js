import { defineConfig, devices } from '@playwright/test';

// Testes no navegador real (Chromium) contra o build de produção (dist-e2e/,
// gerado por `npm run e2e:build`), com o Supabase simulado em e2e/support.
// Rodar: npm run e2e
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // O app pede permissões (notificação, tela acesa) que o teste não usa.
    permissions: [],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  webServer: {
    command: `npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/app/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
