import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildClientPush, buildLatePush, dueLabel, formatMoney, type ChargeRow } from './chargeReminders.ts';

const row = (patch: Partial<ChargeRow> = {}): ChargeRow => ({
  cr_charge: 'c1',
  cr_kind: 'due_soon',
  cr_user: 'u1',
  cr_role: 'client',
  cr_other: 'Carlos',
  cr_desc: 'Mensalidade (2/6)',
  cr_cents: 15050,
  cr_due: '2026-10-20',
  ...patch,
});

Deno.test('dueLabel: dia/mês em pt e mês/dia em en, sem depender de fuso', () => {
  assertEquals(dueLabel('2026-10-20'), '20/10');
  assertEquals(dueLabel('2026-10-20', 'en'), '10/20');
});

Deno.test('formatMoney: reais com centavos', () => {
  assert(formatMoney(15050).includes('150,50'));
  assert(formatMoney(15050, 'en').includes('150.50'));
});

Deno.test('buildClientPush: véspera cita a data, no dia diz hoje', () => {
  const soon = buildClientPush(row());
  assertEquals(soon.title, 'Pagamento vence amanhã 💰');
  assert(soon.body.includes('20/10') && soon.body.includes('Carlos') && soon.body.includes('Mensalidade'));
  const today = buildClientPush(row({ cr_kind: 'due_today' }));
  assertEquals(today.title, 'Pagamento vence hoje 💰');
  assert(today.body.includes('vence hoje'));
  assertEquals(buildClientPush(row({ cr_kind: 'due_today' }), 'en').title, 'Payment due today 💰');
});

Deno.test('buildLatePush: um atraso detalha dias e valor', () => {
  const p = buildLatePush([row({ cr_kind: 'late', cr_role: 'trainer', cr_other: 'Ana', cr_due: '2026-10-10' })], '2026-10-13');
  assertEquals(p.title, 'Pagamento em atraso 💰');
  assert(p.body.includes('Ana') && p.body.includes('3 dias'));
});

Deno.test('buildLatePush: vários resumem e contam o excedente', () => {
  const many = ['A', 'B', 'C', 'D', 'E'].map((n, i) => row({ cr_charge: `c${i}`, cr_kind: 'late', cr_other: n, cr_due: '2026-10-10' }));
  const p = buildLatePush(many, '2026-10-13');
  assertEquals(p.title, '5 pagamentos em atraso 💰');
  assert(p.body.endsWith('; e mais 2.'));
  assertEquals(buildLatePush(many, '2026-10-13', 'en').title, '5 late payments 💰');
});
