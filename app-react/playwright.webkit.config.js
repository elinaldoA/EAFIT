import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

// Os mesmos testes no WebKit (motor do Safari), com perfil de iPhone.
// Rodar: npx playwright test -c playwright.webkit.config.js
//
// Fica de fora o treino sem rede (offline-workout): ele espera o service worker
// assumir a página, e no WebKit do Playwright a rede de uma página controlada por
// service worker não passa pelo Supabase simulado (as gravações nunca chegam ao
// falso) — limitação da ferramenta, não do app. Esse arquivo roda no Chromium.
export default defineConfig({
  ...base,
  testIgnore: '**/offline-workout.spec.js',
  use: { ...base.use, ...devices['iPhone 15'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', permissions: [] },
});
