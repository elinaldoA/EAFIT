// Regressão do bug corrigido em delete-account/index.ts: a lista de tabelas
// apagadas quando um usuário exclui a própria conta precisa ser IDÊNTICA à
// usada por admin-users/index.ts (ação deleteUser) — daí as duas chamarem
// esta mesma função em vez de manter listas próprias que podem divergir.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { deleteUserData } from './deleteUserData.ts';

// deno-lint-ignore no-explicit-any
type FakeChain = {
  select: () => FakeChain;
  eq: () => FakeChain;
  in: () => FakeChain;
  delete: () => FakeChain;
  then: (resolve: (v: { data: any; error: any }) => void, reject?: (e: any) => void) => Promise<void>;
};

// Mesma forma pras duas coisas que deleteUserData faz em cada tabela:
// select().eq() (lista) ou delete().eq()/delete().in() (ignora o resultado,
// só olha error) — sempre awaited direto, então só precisa ser "thenable".
// deno-lint-ignore no-explicit-any
function makeChain(result: { data: any; error: any }): FakeChain {
  const chain: FakeChain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    delete: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

type FakeAdminOpts = {
  workouts?: { id: string }[];
  plans?: { id: string }[];
  days?: { id: string }[];
  files?: { name: string }[];
};

function makeFakeAdmin(opts: FakeAdminOpts = {}) {
  const calledTables: string[] = [];
  let removedPaths: string[] = [];

  const admin = {
    from(table: string) {
      calledTables.push(table);
      if (table === 'workouts') return makeChain({ data: opts.workouts ?? [], error: null });
      if (table === 'workout_plans') return makeChain({ data: opts.plans ?? [], error: null });
      if (table === 'plan_days') return makeChain({ data: opts.days ?? [], error: null });
      return makeChain({ data: null, error: null });
    },
    storage: {
      from(_bucket: string) {
        return {
          list: (_prefix: string) => Promise.resolve({ data: opts.files ?? [], error: null }),
          // deno-lint-ignore no-explicit-any
          remove: (paths: string[]) => { removedPaths = paths; return Promise.resolve({ data: null as any, error: null }); },
        };
      },
    },
  };

  return { admin, calledTables, getRemovedPaths: () => removedPaths };
}

const DIRECT_TABLES = ['progress_photos', 'water_logs', 'weight_logs', 'achievements', 'push_subscriptions', 'exercise_discomfort'];

Deno.test('deleteUserData apaga de todas as tabelas diretas, incluindo exercise_discomfort', async () => {
  const { admin, calledTables } = makeFakeAdmin();

  await deleteUserData(admin as unknown as SupabaseClient, 'user-1');

  for (const table of DIRECT_TABLES) {
    assert(calledTables.includes(table), `esperava chamada a .from('${table}')`);
  }
  assert(calledTables.includes('profiles'), 'esperava apagar o profile também');
});

Deno.test('deleteUserData apaga workouts/plans mesmo sem filhos, e pula exercise_sets/exercise_logs/plan_exercises quando não há ids', async () => {
  const { admin, calledTables } = makeFakeAdmin({ workouts: [], plans: [] });

  await deleteUserData(admin as unknown as SupabaseClient, 'user-1');

  assertEquals(calledTables.includes('exercise_sets'), false);
  assertEquals(calledTables.includes('exercise_logs'), false);
  assertEquals(calledTables.includes('plan_exercises'), false);
  assert(calledTables.includes('workouts'));
  assert(calledTables.includes('workout_plans'));
});

Deno.test('deleteUserData apaga exercise_sets/exercise_logs/plan_exercises quando há workouts e planos', async () => {
  const { admin, calledTables } = makeFakeAdmin({
    workouts: [{ id: 'w1' }, { id: 'w2' }],
    plans: [{ id: 'p1' }],
    days: [{ id: 'd1' }],
  });

  await deleteUserData(admin as unknown as SupabaseClient, 'user-1');

  assert(calledTables.includes('exercise_sets'));
  assert(calledTables.includes('exercise_logs'));
  assert(calledTables.includes('plan_days'));
  assert(calledTables.includes('plan_exercises'));
});

Deno.test('deleteUserData remove do storage as fotos de progresso existentes, com o path prefixado pelo userId', async () => {
  const { admin, getRemovedPaths } = makeFakeAdmin({ files: [{ name: 'a.jpg' }, { name: 'b.jpg' }] });

  await deleteUserData(admin as unknown as SupabaseClient, 'user-42');

  assertEquals(getRemovedPaths(), ['user-42/a.jpg', 'user-42/b.jpg']);
});

Deno.test('deleteUserData não tenta remover do storage quando não há fotos', async () => {
  const { admin, getRemovedPaths } = makeFakeAdmin({ files: [] });

  await deleteUserData(admin as unknown as SupabaseClient, 'user-42');

  assertEquals(getRemovedPaths(), []);
});

Deno.test('deleteUserData propaga o erro e para a execução se uma exclusão falhar', async () => {
  const admin = {
    from(table: string) {
      if (table === 'workouts') return makeChain({ data: [], error: null });
      if (table === 'workout_plans') return makeChain({ data: [], error: null });
      if (table === 'progress_photos') return makeChain({ data: null, error: new Error('falha simulada') });
      return makeChain({ data: null, error: null });
    },
    storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) },
  };

  let threw = false;
  try {
    await deleteUserData(admin as unknown as SupabaseClient, 'user-1');
  } catch {
    threw = true;
  }
  assert(threw, 'esperava que o erro em progress_photos interrompesse deleteUserData');
});
