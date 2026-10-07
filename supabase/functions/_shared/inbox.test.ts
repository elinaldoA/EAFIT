import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { listAllUserIds, saveInbox } from './inbox.ts';

// Silencia console.error durante o teste e devolve o que foi logado.
async function capturingErrors(fn: () => Promise<void>): Promise<string[]> {
  const original = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return logged;
}

function fakeAuthAdmin(pages: Array<{ users?: { id: string }[]; error?: { message: string } }>) {
  const calls: Array<{ page: number; perPage: number }> = [];
  const admin = {
    auth: {
      admin: {
        listUsers: (args: { page: number; perPage: number }) => {
          calls.push(args);
          const res = pages[args.page - 1] ?? { users: [] };
          return Promise.resolve(res.error ? { data: null, error: res.error } : { data: { users: res.users }, error: null });
        },
      },
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

const users = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${from + i}` }));

Deno.test('listAllUserIds junta todas as páginas até vir uma incompleta', async () => {
  const { admin, calls } = fakeAuthAdmin([{ users: users(0, 1000) }, { users: users(1000, 3) }]);
  const ids = await listAllUserIds(admin);
  assertEquals(ids.length, 1003);
  assertEquals(ids[0], 'u0');
  assertEquals(ids[1002], 'u1002');
  assertEquals(calls, [{ page: 1, perPage: 1000 }, { page: 2, perPage: 1000 }]);
});

Deno.test('listAllUserIds com uma página só não pede a seguinte', async () => {
  const { admin, calls } = fakeAuthAdmin([{ users: users(0, 2) }]);
  assertEquals(await listAllUserIds(admin), ['u0', 'u1']);
  assertEquals(calls.length, 1);
});

Deno.test('listAllUserIds devolve o que já tinha quando uma página falha', async () => {
  const { admin } = fakeAuthAdmin([{ users: users(0, 1000) }, { error: { message: 'boom' } }]);
  let ids: string[] = [];
  const logged = await capturingErrors(async () => { ids = await listAllUserIds(admin); });
  assertEquals(ids.length, 1000);
  assertEquals(logged, ['inbox listUsers error: boom']);
});

function fakeInsertAdmin(failOnBatch = -1) {
  const batches: Array<Array<Record<string, unknown>>> = [];
  const tables: string[] = [];
  const admin = {
    from: (table: string) => {
      tables.push(table);
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          batches.push(rows);
          const failed = batches.length - 1 === failOnBatch;
          return Promise.resolve({ error: failed ? { message: 'rls' } : null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, batches, tables };
}

Deno.test('saveInbox grava uma linha por usuário com o conteúdo do aviso', async () => {
  const { admin, batches, tables } = fakeInsertAdmin();
  await saveInbox(admin, ['a', 'b'], { kind: 'broadcast', title: 'Oi', body: 'Corpo' });
  assertEquals(tables, ['user_notifications']);
  assertEquals(batches, [[
    { user_id: 'a', kind: 'broadcast', title: 'Oi', body: 'Corpo' },
    { user_id: 'b', kind: 'broadcast', title: 'Oi', body: 'Corpo' },
  ]]);
});

Deno.test('saveInbox divide em lotes de 500', async () => {
  const { admin, batches } = fakeInsertAdmin();
  const ids = Array.from({ length: 1201 }, (_, i) => `u${i}`);
  await saveInbox(admin, ids, { kind: 'k', title: 't', body: 'b' });
  assertEquals(batches.map((b) => b.length), [500, 500, 201]);
});

Deno.test('saveInbox sem destinatários não consulta o banco', async () => {
  const { admin, tables } = fakeInsertAdmin();
  await saveInbox(admin, [], { kind: 'k', title: 't', body: 'b' });
  assertEquals(tables, []);
});

Deno.test('saveInbox continua nos lotes seguintes se um falhar e só loga', async () => {
  const { admin, batches } = fakeInsertAdmin(0);
  const ids = Array.from({ length: 600 }, (_, i) => `u${i}`);
  const logged = await capturingErrors(() => saveInbox(admin, ids, { kind: 'k', title: 't', body: 'b' }));
  assertEquals(batches.length, 2);
  assertEquals(logged, ['inbox insert error: rls']);
});
