import { assertEquals } from 'jsr:@std/assert@1';
import { buildAlertPush, buildWeeklyPush, groupBy, inAlertWindow, isWeeklySummaryTime } from './trainerAlerts.ts';

Deno.test('inAlertWindow: só das 8h às 20h', () => {
  assertEquals([7, 8, 20, 21].map(inAlertWindow), [false, true, true, false]);
});

Deno.test('isWeeklySummaryTime: segunda às 8h', () => {
  assertEquals(isWeeklySummaryTime(8, 1), true);
  assertEquals(isWeeklySummaryTime(9, 1), false);
  assertEquals(isWeeklySummaryTime(8, 2), false);
});

Deno.test('buildAlertPush: um alerta é específico', () => {
  assertEquals(buildAlertPush([{ kind: 'inactive', name: 'Rafa', detail: 'há 9 dias' }]), {
    title: 'Aluno sem treinar',
    body: 'Rafa está sem treinar há 9 dias.',
  });
  assertEquals(buildAlertPush([{ kind: 'pr', name: 'Ana', detail: 'Supino 82,5 kg' }]).title, 'Novo recorde 🏆');
  assertEquals(buildAlertPush([{ kind: 'pain', name: 'Bia', detail: 'Agachamento (dor forte)' }]).body, 'Bia relatou dor: Agachamento (dor forte).');
});

Deno.test('buildAlertPush: vários alertas viram um resumo', () => {
  const items = [
    { kind: 'inactive' as const, name: 'A', detail: 'há 7 dias' },
    { kind: 'pr' as const, name: 'B', detail: 'Supino 80 kg' },
    { kind: 'pain' as const, name: 'C', detail: 'Remada (lesão)' },
    { kind: 'inactive' as const, name: 'D', detail: 'há 8 dias' },
  ];
  const push = buildAlertPush(items);
  assertEquals(push.title, '4 alertas dos seus alunos');
  assertEquals(push.body.endsWith('; e mais 1.'), true);
});

Deno.test('buildWeeklyPush: texto do resumo', () => {
  assertEquals(
    buildWeeklyPush({ clients: 12, active: 9, sessions: 38, inactive: 3, top: 'Carol (6 dias)' }).body,
    '9/12 alunos treinaram (38 treinos). 3 ficaram sem treinar. Destaque: Carol (6 dias).',
  );
  assertEquals(
    buildWeeklyPush({ clients: 1, active: 1, sessions: 1, inactive: 0, top: null }).body,
    '1/1 alunos treinaram (1 treino). Ninguém ficou parado!',
  );
});

Deno.test('groupBy agrupa mantendo a ordem', () => {
  const g = groupBy([{ t: 'a', n: 1 }, { t: 'b', n: 2 }, { t: 'a', n: 3 }], (r) => r.t);
  assertEquals([...g.keys()], ['a', 'b']);
  assertEquals(g.get('a')!.map((r) => r.n), [1, 3]);
});

Deno.test('buildAlertPush em inglês: título, detalhe e exercício traduzidos', () => {
  assertEquals(buildAlertPush([{ kind: 'inactive', name: 'Ana', detail: 'há 5 dias' }], 'en'), {
    title: 'Client not training',
    body: 'Ana hasn’t trained for 5 days.',
  });
  assertEquals(buildAlertPush([{ kind: 'pr', name: 'Bia', detail: 'Supino Reto com Barra 80 kg' }], 'en').body, 'Bia hit a PR: Barbell Bench Press 80 kg.');
  assertEquals(buildAlertPush([{ kind: 'pain', name: 'Caio', detail: 'Agachamento Livre (dor forte)' }], 'en').body, 'Caio reported pain: Barbell Back Squat (strong pain).');
});

Deno.test('buildAlertPush em inglês: vários alertas e "mais N"', () => {
  const items = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ kind: 'inactive' as const, name, detail: 'há 3 dias' }));
  const p = buildAlertPush(items, 'en');
  assertEquals(p.title, '5 alerts from your clients');
  assertEquals(p.body.endsWith('; and 2 more.'), true);
});

Deno.test('buildWeeklyPush em inglês', () => {
  assertEquals(buildWeeklyPush({ clients: 4, active: 3, sessions: 1, inactive: 1, top: 'Ana' }, 'en'), {
    title: 'Your clients’ weekly summary',
    body: '3/4 clients trained (1 workout). 1 didn’t train. Top: Ana.',
  });
  assertEquals(buildWeeklyPush({ clients: 2, active: 2, sessions: 5, inactive: 0, top: null }, 'en').body, '2/2 clients trained (5 workouts). Nobody skipped!');
});
