import { assert, assertEquals } from 'jsr:@std/assert@1';
import { canReceiveBulkEmail, type EmailUser, isPaused, weeklyEmailFor } from './weeklyEmails.ts';

const base: EmailUser = {
  id: 'u1', email: 'a@b.com', confirmed: true, bannedUntil: null, createdAt: '2026-09-01T00:00:00Z', meta: {},
};

Deno.test('canReceiveBulkEmail: precisa de e-mail confirmado, sem suspensão e sem descadastro', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  assert(canReceiveBulkEmail(base, now));
  assert(!canReceiveBulkEmail({ ...base, email: null }, now));
  assert(!canReceiveBulkEmail({ ...base, confirmed: false }, now));
  assert(!canReceiveBulkEmail({ ...base, meta: { notifyEmail: false } }, now));
  assert(!canReceiveBulkEmail({ ...base, bannedUntil: '2026-12-01T00:00:00Z' }, now));
  // Suspensão que já acabou não impede.
  assert(canReceiveBulkEmail({ ...base, bannedUntil: '2026-10-01T00:00:00Z' }, now));
});

Deno.test('isPaused: a data de fim é inclusiva', () => {
  assert(isPaused({ pausedUntil: '2026-10-12' }, '2026-10-12'));
  assert(isPaused({ pausedUntil: '2026-10-20' }, '2026-10-12'));
  assert(!isPaused({ pausedUntil: '2026-10-11' }, '2026-10-12'));
  assert(!isPaused({}, '2026-10-12'));
});

Deno.test('weeklyEmailFor: resumo pra quem treinou, volta pra quem parou há 1 a 4 semanas', () => {
  const today = '2026-10-12';
  const created = '2026-08-01';
  assertEquals(weeklyEmailFor({ weekCount: 3, lastWorkoutDate: '2026-10-10', createdDate: created, today }), { kind: 'summary' });

  // Parou há 9 dias: convite pra voltar.
  assertEquals(
    weeklyEmailFor({ weekCount: 0, lastWorkoutDate: '2026-10-03', createdDate: created, today }),
    { kind: 'comeback', days: 9, neverTrained: false },
  );
  // Limites: 7 e 28 dias entram, 6 e 29 não.
  assertEquals(weeklyEmailFor({ weekCount: 0, lastWorkoutDate: '2026-10-05', createdDate: created, today })?.kind, 'comeback');
  assertEquals(weeklyEmailFor({ weekCount: 0, lastWorkoutDate: '2026-09-14', createdDate: created, today })?.kind, 'comeback');
  assertEquals(weeklyEmailFor({ weekCount: 0, lastWorkoutDate: '2026-10-06', createdDate: created, today }), null);
  assertEquals(weeklyEmailFor({ weekCount: 0, lastWorkoutDate: '2026-09-13', createdDate: created, today }), null);

  // Nunca treinou: conta a partir da criação da conta.
  assertEquals(
    weeklyEmailFor({ weekCount: 0, lastWorkoutDate: null, createdDate: '2026-10-02', today }),
    { kind: 'comeback', days: 10, neverTrained: true },
  );
  assertEquals(weeklyEmailFor({ weekCount: 0, lastWorkoutDate: null, createdDate: '2026-10-10', today }), null);
});

Deno.test('weeklyEmailFor: depois de 4 semanas pergunta o motivo, uma vez por período parado', () => {
  const today = '2026-10-12';
  const created = '2026-06-01';
  const stopped = { weekCount: 0, lastWorkoutDate: '2026-09-01', createdDate: created, today };
  const never = { lastSeenDate: null, lastAskedDate: null };

  // Sem o estado do banco, segue como antes: para de insistir.
  assertEquals(weeklyEmailFor(stopped), null);

  // Não abre o app desde o último treino: sumiu.
  assertEquals(
    weeklyEmailFor({ ...stopped, activity: never }),
    { kind: 'why', days: 41, neverTrained: false, segment: 'absent' },
  );
  // Abriu o app há 5 dias, mas não treina.
  assertEquals(
    weeklyEmailFor({ ...stopped, activity: { ...never, lastSeenDate: '2026-10-07' } }),
    { kind: 'why', days: 41, neverTrained: false, segment: 'idle' },
  );
  // Limite do acesso: 30 dias sem abrir é sumiço, 29 ainda não.
  assertEquals(weeklyEmailFor({ ...stopped, lastWorkoutDate: '2026-08-01', activity: { ...never, lastSeenDate: '2026-09-12' } }), {
    kind: 'why', days: 72, neverTrained: false, segment: 'absent',
  });
  assertEquals(weeklyEmailFor({ ...stopped, lastWorkoutDate: '2026-08-01', activity: { ...never, lastSeenDate: '2026-09-13' } }), {
    kind: 'why', days: 72, neverTrained: false, segment: 'idle',
  });

  // Dentro das 4 semanas continua sendo o convite pra voltar.
  assertEquals(weeklyEmailFor({ ...stopped, lastWorkoutDate: '2026-09-14', activity: never })?.kind, 'comeback');
  assertEquals(weeklyEmailFor({ ...stopped, lastWorkoutDate: '2026-09-13', activity: never })?.kind, 'why');

  // Já perguntou depois do último treino: não repete.
  assertEquals(weeklyEmailFor({ ...stopped, activity: { ...never, lastAskedDate: '2026-10-05' } }), null);
  // Perguntou, a pessoa voltou a treinar e parou de novo: pergunta outra vez.
  assertEquals(weeklyEmailFor({ ...stopped, activity: { ...never, lastAskedDate: '2026-08-10' } })?.kind, 'why');

  // Nunca treinou: conta da criação da conta.
  assertEquals(
    weeklyEmailFor({ weekCount: 0, lastWorkoutDate: null, createdDate: '2026-08-01', today, activity: never }),
    { kind: 'why', days: 72, neverTrained: true, segment: 'absent' },
  );
});
