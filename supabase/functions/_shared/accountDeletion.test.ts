import { assertEquals } from 'jsr:@std/assert@1';
import { accountAgeDays, countWorkouts, logAccountDeletion } from './accountDeletion.ts';

const NOW = new Date('2026-10-08T12:00:00Z');

Deno.test('accountAgeDays conta dias inteiros desde a criação', () => {
  assertEquals(accountAgeDays('2026-10-08T00:00:00Z', NOW), 0);
  assertEquals(accountAgeDays('2026-10-01T12:00:00Z', NOW), 7);
  assertEquals(accountAgeDays('2025-10-08T12:00:00Z', NOW), 365);
});

Deno.test('accountAgeDays devolve null sem data válida e nunca fica negativo', () => {
  assertEquals(accountAgeDays(null, NOW), null);
  assertEquals(accountAgeDays('', NOW), null);
  assertEquals(accountAgeDays('não é data', NOW), null);
  assertEquals(accountAgeDays('2026-12-01T00:00:00Z', NOW), 0);
});

// Cliente falso: só o que as funções usam.
function fakeAdmin(result: { count?: number | null; error?: { message: string } | null }) {
  const inserted: unknown[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ count: result.count ?? null, error: result.error ?? null }) }),
      insert: (row: unknown) => { inserted.push(row); return Promise.resolve({ error: result.error ?? null }); },
    }),
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, inserted };
}

Deno.test('countWorkouts devolve a contagem, 0 sem linhas e null em erro', async () => {
  assertEquals(await countWorkouts(fakeAdmin({ count: 12 }).client, 'u1'), 12);
  assertEquals(await countWorkouts(fakeAdmin({ count: null }).client, 'u1'), 0);
  assertEquals(await countWorkouts(fakeAdmin({ error: { message: 'x' } }).client, 'u1'), null);
});

Deno.test('logAccountDeletion grava origem, idade e treinos, sem identificar a pessoa', async () => {
  const { client, inserted } = fakeAdmin({});
  await logAccountDeletion(client, 'self', null, 3);
  assertEquals(inserted, [{ source: 'self', account_age_days: null, workouts: 3 }]);
});

Deno.test('logAccountDeletion não propaga erro de gravação', async () => {
  const { client } = fakeAdmin({ error: { message: 'rls' } });
  await logAccountDeletion(client, 'admin', '2026-01-01T00:00:00Z', null);
});
