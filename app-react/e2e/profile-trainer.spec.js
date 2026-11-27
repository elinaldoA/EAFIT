// Perfil do aluno e fluxo do personal (alunos → ficha → montador de plano) no navegador real.
import { test, expect, USER } from './support/fixtures.js';

test('perfil: abrir "Meu corpo" mostra os campos, com os selects visíveis', async ({ page, fake }) => {
  expect(fake).toBeTruthy(); // liga o Supabase simulado e a sessão
  await page.goto('/app/');
  await page.locator('.bottom-nav').getByText('Mais', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Perfil' }).click();
  await page.locator('section.page.active').getByText('Meu corpo', { exact: true }).click();
  await expect(page.getByLabel('Sexo biológico')).toBeVisible();
  await expect(page.locator('section.page.active select:visible').first()).toBeVisible();
});

test('personal: da lista de alunos ao montador, avisa quando o nome do exercício se repete no dia', async ({ page, fake, context }) => {
  const client = { rs_id: 'c1', rs_name: 'Maria Teste', rs_email: 'maria@x.test', rs_since: '2026-01-01', rs_last_day: '2026-11-20', rs_days_7: 3, rs_days_30: 12, rs_paused: false, rs_goal: 'Ganho de massa', rs_level: 'Intermediário', rs_weekly_goal: 4, rs_plan_name: null, rs_plan_days: null, rs_plan_end: null, rs_plan_by_me: false, rs_pain_7: 0, rs_tags: [], rs_recent: [] };
  const answers = {
    is_trainer: true, trainer_my_code: 'ABC123', trainer_roster: [client],
    trainer_client_detail: { training_days: ['2026-11-20', '2026-11-22'], weights: [], measurements: [], checkins: [], loads: [], discomfort: [], plan: null },
    trainer_client_plan: null, trainer_client_plans: [],
  };
  const original = fake.rpc.bind(fake);
  fake.rpc = name => (name in answers ? { status: 200, body: answers[name] } : original(name));
  // Sem o tutorial de boas-vindas do personal na frente.
  await context.addInitScript(id => { try { localStorage.setItem(`eafit_tutorial_done:trainer:${id}`, '1'); } catch { /* sem storage */ } }, USER.id);

  await page.goto('/app/');
  await page.locator('.bottom-nav').getByText('Alunos', { exact: true }).click();
  await page.getByText('Maria Teste').first().click();
  await page.getByRole('tab', { name: 'Plano' }).click();
  await page.getByRole('button', { name: /Montar treino/ }).click();
  await page.getByRole('button', { name: 'Seg', exact: true }).click();

  // O dia já abre com uma linha de exercício vazia.
  const names = page.locator('.plan-ex-row__name');
  await names.nth(0).fill('Supino Reto');
  await page.getByRole('button', { name: '+ Exercício' }).first().click();
  await expect(names).toHaveCount(2);
  await names.nth(1).fill('Supino Reto');
  await expect(page.getByRole('alert').filter({ hasText: 'Há outro exercício com este nome neste dia' })).toHaveCount(2);
  // Os selects extras mostram o texto inteiro, sem cortar ("Automático").
  await expect(page.getByRole('combobox', { name: /Aquecimento/ }).or(page.locator('.plan-ex-row__extra select').nth(1)).first()).toBeVisible();
});
