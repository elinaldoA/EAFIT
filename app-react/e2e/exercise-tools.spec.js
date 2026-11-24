// Ferramentas por exercício (nota, histórico, repetir o último treino, regra de
// progressão, cadência, descanso pelo RIR, músculo) no navegador real.
import { test, expect, USER } from './support/fixtures.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => iso(new Date(Date.now() - n * 86400000));

// Séries de hoje (as sessões antigas semeadas acima têm workout_id 'w-old…').
const today = (fake, nome, n) => fake.sets.find(s => s.exercise_name === nome && s.set_number === n && !String(s.workout_id).startsWith('w-old'));

test.beforeEach(async ({ fake }) => {
  // Supino com faixa 8-12, 90 s e cadência escrita na técnica; mais um exercício que a biblioteca não conhece.
  fake.rows('plan_exercises').forEach(r => {
    if (r.nome === 'Supino Reto') Object.assign(r, { reps: '8-12', descanso: '90s', tecnica: 'Cadência 3-1-1' });
  });
  fake.rows('plan_days').forEach((d, i) => fake.seed('plan_exercises', [
    { id: `ex-x-${i}`, plan_day_id: d.id, is_post_workout: false, order_index: 1, tecnica: '', grupo: null, aquecimento: 0, intensidade: null, nome: 'Zxqv Misterioso', series: '3', reps: '10', descanso: '60s' },
  ]));
  // Duas sessões anteriores do supino.
  [[6, [[55, 10], [55, 10], [55, 9]]], [3, [[60, 10], [60, 9], [60, 8]]]].forEach(([ago, sets], i) => {
    fake.seed('workouts', [{ id: `w-old${i}`, user_id: USER.id, workout_date: daysAgo(ago), completed: true, created_at: new Date().toISOString() }]);
    sets.forEach(([carga, reps], k) => fake.seed('exercise_sets', [{ workout_id: `w-old${i}`, exercise_name: 'Supino Reto', set_number: k + 1, carga, reps, completed: true, rir: null }]));
  });
});

test('regra, cadência, repetir último treino, nota, histórico e descanso pelo RIR', async ({ page, fake }) => {
  await page.goto('/app/');
  await page.locator('.today-card').getByRole('button', { name: '⚡ Começar treino' }).click();
  const live = page.locator('.live');
  await expect(live).toBeVisible();

  await expect(live.getByText(/Faixa 8–12: bata 12 reps/)).toBeVisible();
  await expect(live.getByText(/Cadência 3-1-1: descer 3s · pausa 1s · subir 1s/)).toBeVisible();

  // Repetir o último treino: cada série recebe a carga/reps da sessão de 3 dias atrás.
  await live.getByRole('button', { name: '↩︎ Repetir o último treino' }).click();
  const row = n => live.locator('.set-row').filter({ hasText: `Série ${n}` });
  await expect(row(1).getByPlaceholder('kg')).toHaveValue('60');
  await expect(row(1).getByPlaceholder('reps')).toHaveValue('10');
  await expect(row(3).getByPlaceholder('reps')).toHaveValue('8');
  await expect.poll(() => today(fake, 'Supino Reto', 3)).toMatchObject({ carga: 60, reps: 8 });
  await page.screenshot({ path: 'test-results/tools-1-live.png', fullPage: true });

  // Nota do exercício: salva no servidor e reaparece.
  await live.getByRole('button', { name: '📝 Nota' }).click();
  await live.getByLabel('Nota do exercício').fill('banco na posição 4');
  await live.getByLabel('Nota do exercício').blur();
  await expect(live.getByText('📝 banco na posição 4')).toBeVisible();
  await expect.poll(() => fake.rows('exercise_notes').map(n => n.note)).toContain('banco na posição 4');

  // Histórico: as duas sessões anteriores, com 1RM.
  await live.getByRole('button', { name: '📊 Histórico' }).click();
  const list = live.locator('.ex-history__list li');
  await expect(list).toHaveCount(2);
  await expect(list.first()).toContainText('60 kg × 10');
  await expect(list.first()).toContainText('1RM ~');
  await page.screenshot({ path: 'test-results/tools-2-history.png', fullPage: true });

  // Descanso: série 1 até a falha (RIR 0) → o descanso da série 2 ganha 30 s (90 → 120 s).
  await row(1).getByRole('button', { name: '✓' }).tap();
  // As bolinhas de RIR ficam logo abaixo da linha da série, no mesmo bloco.
  await live.getByRole('group', { name: 'Quantas reps ainda sobravam?' }).first().getByRole('button', { name: '0', exact: true }).click();
  await row(2).getByRole('button', { name: '✓' }).tap();
  await expect(live.getByText(/^0[12]:[0-9]{2}$/).first()).toHaveText(/^(02:00|01:5[89])$/);
  await page.screenshot({ path: 'test-results/tools-3-rest.png', fullPage: true });
});

test('exercício fora da biblioteca pergunta o músculo, guarda e passa a mostrar "Conta como"', async ({ page, fake }) => {
  await page.goto('/app/');
  await page.locator('.today-card').getByRole('button', { name: '⚡ Começar treino' }).click();
  const live = page.locator('.live');
  await expect(live).toBeVisible();
  // Vai para o 2º exercício do dia.
  await live.getByRole('button', { name: /Próximo/ }).click();
  await expect(live.getByText(/Zxqv Misterioso/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/tools-4-second.png', fullPage: true });
  const ask = live.getByText('💪 Qual músculo este exercício trabalha?');
  await expect(ask).toBeVisible({ timeout: 15000 });
  await live.locator('select').filter({ has: page.locator('option', { hasText: 'Escolher…' }) }).selectOption('glutes');
  await expect(live.getByText(/Conta como: Glúteos/)).toBeVisible();
  await expect.poll(() => fake.rows('exercise_muscles').map(r => r.muscle)).toContain('glutes');
});

test('o card da semana mostra o músculo do plano abaixo de 10 séries', async ({ page, fake }) => {
  // Precisa de histórico anterior à janela de 7 dias, senão a primeira semana inteira pareceria "atrasada".
  fake.seed('workouts', [{ id: 'w-old9', user_id: USER.id, workout_date: daysAgo(12), completed: true, created_at: new Date().toISOString() }]);
  fake.seed('exercise_sets', [{ workout_id: 'w-old9', exercise_name: 'Supino Reto', set_number: 1, carga: 50, reps: 10, completed: true, rir: null }]);
  await page.goto('/app/');
  // Supino (peito): 3 + 3 séries nos últimos 7 dias → 6/10.
  await expect(page.locator('.progress-card__muscles')).toContainText('Peitoral 6/10');
  await page.screenshot({ path: 'test-results/tools-5-week.png', fullPage: true });
});

test('editor do plano avisa quando dois exercícios do dia têm o mesmo nome', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('button', { name: '⚙️ Editar treino' }).click();
  await page.getByRole('tab', { name: 'Editar dia' }).or(page.getByRole('button', { name: 'Editar dia' })).first().click();
  const names = page.locator('.plan-ex-row__name');
  await expect(names.first()).toBeVisible();
  await names.nth(1).fill('Supino Reto');
  await names.nth(1).blur();
  await expect(page.getByRole('alert').filter({ hasText: 'Há outro exercício com este nome neste dia' })).toHaveCount(2);
  await page.screenshot({ path: 'test-results/tools-6-editor.png', fullPage: true });
});
