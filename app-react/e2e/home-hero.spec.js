// Topo do Treino: saudação, semana em dias e atalhos para as outras telas.
import { test, expect } from './support/fixtures.js';

test('topo do Treino cumprimenta, mostra a semana e leva aos atalhos', async ({ page, fake }) => {
  await page.goto('/app/');
  const hero = page.locator('.home-hero');
  await expect(hero.getByRole('heading')).toContainText(/Bom dia|Boa tarde|Boa noite/);
  await expect(hero.locator('.week-strip__day').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/home-hero.png' });

  await hero.getByRole('button', { name: /Histórico/ }).click();
  await expect(page.locator('.history-cal')).toBeVisible();
});
