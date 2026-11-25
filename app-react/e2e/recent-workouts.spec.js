// Treinos recentes e anel de aderência na tela de Treino.
import { test, expect, USER } from './support/fixtures.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => iso(new Date(Date.now() - n * 86400000));

function seedSession(fake, id, ago, dia, nome, n) {
  fake.seed('workouts', [{ id, user_id: USER.id, workout_date: daysAgo(ago), day_of_week: dia, completed: true, duration_seconds: 2700, created_at: new Date().toISOString() }]);
  for (let k = 0; k < n; k++) {
    fake.seed('exercise_sets', [{ workout_id: id, exercise_name: nome, set_number: k + 1, carga: 40, reps: 10, completed: true, rir: null }]);
  }
}

test('mostra os últimos treinos, abre o detalhe e o anel da semana', async ({ page, fake }) => {
  seedSession(fake, 'w-a', 1, 'Terça', 'Supino Reto', 4);
  seedSession(fake, 'w-b', 3, 'Domingo', 'Agachamento Livre', 3);
  await page.goto('/app/');

  await expect(page.locator('.adherence__ring')).toBeVisible();
  const recentes = page.getByRole('region', { name: 'Treinos recentes' });
  await expect(recentes.locator('.history-item')).toHaveCount(2);
  await expect(recentes.locator('.history-item').first()).toContainText('4 séries');
  await page.locator('.progress-card').screenshot({ path: 'test-results/adherence.png' });
  await page.locator('.recent').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/recent-workouts.png' });

  await recentes.locator('.history-item').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
