import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildReminderPush, buildResponsePush, canSendNow, type ReminderRow } from './appointmentReminders.ts';

const row = (patch: Partial<ReminderRow> = {}): ReminderRow => ({
  ar_appt: 'a1',
  ar_kind: 'day',
  ar_user: 'u1',
  ar_role: 'client',
  ar_other: 'Carlos',
  ar_starts: '2026-10-20T21:30:00Z', // 18:30 em Brasília
  ar_place: 'Academia Central',
  ar_status: 'confirmed',
  ...patch,
});

Deno.test('canSendNow: véspera só das 8h às 20h; "daqui a pouco" sempre', () => {
  assertEquals([7, 8, 20, 21].map((h) => canSendNow('day', h)), [false, true, true, false]);
  assertEquals([5, 12, 23].map((h) => canSendNow('hour', h)), [true, true, true]);
});

Deno.test('buildReminderPush: horário no fuso de Brasília, local e quem é', () => {
  const p = buildReminderPush(row());
  assertEquals(p.title, 'Aula amanhã 📅');
  assert(p.body.includes('18:30'));
  assert(p.body.includes('Carlos'));
  assert(p.body.includes('Academia Central'));
});

Deno.test('buildReminderPush: aluno com aula pendente é lembrado de confirmar', () => {
  assert(buildReminderPush(row({ ar_status: 'pending' })).body.includes('Confirme no app'));
  assert(!buildReminderPush(row({ ar_status: 'pending', ar_role: 'trainer' })).body.includes('Confirme no app'));
  assert(!buildReminderPush(row()).body.includes('Confirme no app'));
});

Deno.test('buildReminderPush: lembrete de uma hora', () => {
  assertEquals(buildReminderPush(row({ ar_kind: 'hour', ar_place: null })).title, 'Sua aula é daqui a pouco ⏰');
});

Deno.test('buildResponsePush: confirmou e recusou', () => {
  assert(buildResponsePush('confirmed', 'Ana', '2026-10-20T21:30:00Z').body.includes('Ana confirmou'));
  assertEquals(buildResponsePush('declined', 'Ana', '2026-10-20T21:30:00Z').title, 'Aula recusada');
});
