// Recuperação muscular (Evolução → Recuperação) no navegador real, com o Supabase simulado.
import { test, expect, USER } from './support/fixtures.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = n => iso(new Date(Date.now() - n * 86400000));

// Uma sessão por dia, com `n` séries concluídas de cada exercício.
function seedSession(fake, id, ago, items) {
  fake.seed('workouts', [{ id, user_id: USER.id, workout_date: daysAgo(ago), completed: true, created_at: new Date().toISOString() }]);
  items.forEach(([nome, n]) => {
    for (let k = 0; k < n; k++) {
      fake.seed('exercise_sets', [{ workout_id: id, exercise_name: nome, set_number: k + 1, carga: 40, reps: 10, completed: true, rir: null }]);
    }
  });
}

test('mostra quem está descansando e quem já está pronto, e o que falta para ficar pronto', async ({ page, fake }) => {
  seedSession(fake, 'w-r0', 0, [['Elevação Lateral', 4]]); // ombros, hoje
  seedSession(fake, 'w-r1', 1, [['Rosca Direta', 4]]); // bíceps, ontem
  seedSession(fake, 'w-r2', 5, [['Agachamento Livre', 8]]); // quadríceps, há 5 dias

  await page.goto('/app/');
  await page.locator('.bottom-nav').getByRole('button', { name: /Evolução/ }).click();
  await page.getByRole('tab', { name: 'Recuperação' }).click();

  const resumo = page.locator('.recovery__summary');
  await expect(resumo).toContainText('Prontos para treinar:');
  await expect(resumo).toContainText('Bíceps');
  await expect(resumo).toContainText('Quadríceps');
  await expect(resumo).toContainText('Ainda descansando: Ombros');

  const descansando = page.getByRole('region', { name: 'Descansando' });
  await expect(descansando.getByText('Ombros')).toBeVisible();
  await expect(descansando.getByText('Pronto em 1 dia')).toBeVisible();
  await expect(descansando.getByText('Treinado hoje · 4 séries')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recuperados' }).getByText('Bíceps')).toBeVisible();
  await page.screenshot({ path: 'test-results/recovery-1.png', fullPage: true });
});

test('sem treino nas últimas semanas, explica como começar', async ({ page, fake }) => {
  expect(fake.rows('exercise_sets')).toHaveLength(0);
  await page.goto('/app/');
  await page.locator('.bottom-nav').getByRole('button', { name: /Evolução/ }).click();
  await page.getByRole('tab', { name: 'Recuperação' }).click();
  await expect(page.getByText(/Nenhum treino nas últimas 8 semanas/)).toBeVisible();
});

test('no Treino: músculo de hoje ainda se recuperando avisa, sugere outro dia que cabe e abre o treino dele', async ({ page, fake }) => {
  const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const hoje = NOMES[new Date().getDay()];
  const amanha = NOMES[(new Date().getDay() + 1) % 7];
  // Hoje é dia de peito (Supino, do plano padrão do teste); os outros dias são de costas.
  fake.rows('plan_days').forEach(d => { if (d.dia !== hoje) d.foco = 'Costas'; });
  fake.rows('plan_exercises').forEach(ex => {
    const dia = fake.rows('plan_days').find(d => d.id === ex.plan_day_id).dia;
    if (dia !== hoje) ex.nome = 'Remada Curvada com Barra';
  });
  seedSession(fake, 'w-r1', 1, [['Supino Reto', 6]]); // peito ontem

  await page.goto('/app/');
  const coach = page.locator('.train-coach');
  await expect(coach).toContainText('Ainda em recuperação do último treino: Peitoral');
  await page.screenshot({ path: 'test-results/recovery-2-treino.png' });
  await coach.getByRole('button', { name: `⚡ Treinar ${amanha} hoje (Costas)` }).click();
  const live = page.locator('.live');
  await expect(live).toBeVisible();
  await expect(live.getByText('Remada Curvada com Barra').first()).toBeVisible();
});
