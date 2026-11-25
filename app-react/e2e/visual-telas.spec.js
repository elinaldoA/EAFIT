// Capturas de todas as abas nos temas claro, escuro e de temporada (Dia das Bruxas).
import { test, expect, USER } from './support/fixtures.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ABAS = [['Treino', 'treino'], ['Água', 'agua'], ['Nutrição', 'nutricao'], ['Evolução', 'evolucao'], ['Perfil', 'perfil']];
const TEMAS = [['claro', { theme: 'light' }], ['escuro', { theme: 'dark' }], ['bruxas', { theme: 'dark', season: 'halloween' }]];

for (const [nomeTema, { theme, season }] of TEMAS) {
  test(`telas no tema ${nomeTema}`, async ({ page, fake }) => {
    fake.seed('workouts', [{ id: 'w-1', user_id: USER.id, workout_date: iso(new Date(Date.now() - 86400000)), day_of_week: 'Terça', completed: true, duration_seconds: 2700, created_at: new Date().toISOString() }]);
    await page.goto('/app/');
    await expect(page.locator('.home-hero')).toBeVisible();
    await page.evaluate(({ theme, season }) => {
      const root = document.documentElement;
      root.setAttribute('data-theme', theme);
      if (season) root.setAttribute('data-season', season);
    }, { theme, season });
    for (const [rotulo, chave] of ABAS) {
      await page.locator('.bottom-nav').getByRole('button', { name: new RegExp(rotulo) }).click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `test-results/telas-${nomeTema}-${chave}.png` });
    }
  });
}

test('modo ao vivo e login', async ({ page, fake }) => {
  await page.goto('/app/');
  await page.locator('.today-card').getByRole('button', { name: /Começar treino/ }).click();
  await expect(page.locator('.live')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/telas-claro-live.png' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: 'test-results/telas-escuro-live.png' });
});

test('login', async ({ page }) => {
  await page.goto('/app/');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/telas-claro-login.png' });
});
