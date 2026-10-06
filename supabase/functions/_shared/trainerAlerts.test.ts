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
