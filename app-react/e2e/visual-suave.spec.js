// Captura do visual novo do Treino (claro e escuro) e verificação dos mini-cartões.
import { test, expect, USER } from './support/fixtures.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('Treino com topo escuro, cartão laranja e mini-cartões', async ({ page, fake }) => {
  fake.seed('workouts', [{ id: 'w-1', user_id: USER.id, workout_date: iso(new Date(Date.now() - 86400000)), day_of_week: 'Terça', completed: true, duration_seconds: 2700, created_at: new Date().toISOString() }]);
  await page.addInitScript(() => {
    const d = new Date();
    localStorage.setItem(`agua_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, '1500');
  });
  await page.goto('/app/');
  const tiles = page.locator('.home-tiles');
  await expect(tiles.getByText('Hidratação')).toBeVisible();
  await expect(tiles.getByText('Proteína')).toBeVisible();
  await page.screenshot({ path: 'test-results/suave-claro.png' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: 'test-results/suave-escuro.png' });
});
