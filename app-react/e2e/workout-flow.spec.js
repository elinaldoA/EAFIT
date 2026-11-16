// Fazer o treino como a pessoa faz na academia, no navegador real (Chromium,
// Pixel 7), com o Supabase simulado (e2e/support).
import { test, expect } from './support/fixtures.js';

const row = (page, n) => page.locator('.live .set-row').filter({ hasText: `Série ${n}` });

test('digitar carga e reps da Série 1 e tocar no ✓ direto, com o teclado aberto, marca a série e repete os valores nas outras', async ({ page, fake }) => {
  await page.goto('/app/');
  await page.locator('.today-card').getByRole('button', { name: '⚡ Começar treino' }).click();
  await expect(page.locator('.live')).toBeVisible();

  await row(page, 1).getByPlaceholder('kg').fill('60');
  await row(page, 1).getByPlaceholder('reps').fill('10');
  // Sem tirar o foco antes: o toque no ✓ é o que fecha o campo. Antes, a cópia
  // para as outras séries recriava a linha no meio do toque e a série não era marcada.
  await row(page, 1).getByRole('button', { name: '✓' }).tap();

  await expect(row(page, 1).getByRole('button', { name: '✓' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 2).getByPlaceholder('kg')).toHaveValue('60');
  await expect(row(page, 2).getByPlaceholder('reps')).toHaveValue('10');
  await expect.poll(() => fake.setOf('Supino Reto', 1)).toMatchObject({ carga: 60, reps: 10, completed: true });
});
