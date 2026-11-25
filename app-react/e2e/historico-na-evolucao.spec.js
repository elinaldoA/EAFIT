// O Histórico virou aba da Evolução: a barra de baixo tem 5 abas e o atalho antigo (#historico) ainda abre o calendário.
import { test, expect } from './support/fixtures.js';

test('Histórico fica dentro da Evolução e a barra de baixo tem 5 abas', async ({ page, fake }) => {
  await page.goto('/app/');
  const nav = page.locator('.bottom-nav');
  await expect(nav.getByRole('button')).toHaveCount(5);
  await expect(nav.getByRole('button', { name: /Histórico/ })).toHaveCount(0);
  await nav.getByRole('button', { name: /Evolução/ }).click();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.locator('.history-cal')).toBeVisible();
  await page.screenshot({ path: 'test-results/historico-evolucao.png' });
});

test('link antigo #historico abre o calendário na Evolução', async ({ page, fake }) => {
  await page.goto('/app/#historico');
  await expect(page.locator('.history-cal')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true');
});
