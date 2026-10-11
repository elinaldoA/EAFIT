import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { BAN_FOREVER, deactivateAccount, normalizeReason, reactivateAccount } from './accountDeactivation.ts';

type FakeOpts = { rowError?: Error; banError?: Error; pushError?: Error };

// Registra, na ordem, cada operação feita no banco e no GoTrue.
function makeFakeAdmin(opts: FakeOpts = {}) {
  const ops: string[] = [];
  // deno-lint-ignore no-explicit-any
  let upserted: any = null;

  const admin = {
    from(table: string) {
      return {
        // deno-lint-ignore no-explicit-any
        upsert(row: any) {
          ops.push(`${table}.upsert`);
          upserted = row;
          return Promise.resolve({ error: opts.rowError ?? null });
        },
        delete() {
          return {
            eq(column: string, value: string) {
              ops.push(`${table}.delete.${column}=${value}`);
              const error = table === 'push_subscriptions' ? opts.pushError : opts.rowError;
              return Promise.resolve({ error: error ?? null });
            },
          };
        },
      };
    },
    auth: {
      admin: {
        updateUserById(id: string, attrs: { ban_duration: string }) {
          ops.push(`ban.${id}=${attrs.ban_duration}`);
          return Promise.resolve({ error: opts.banError ?? null });
        },
      },
    },
  };

  return { admin: admin as unknown as SupabaseClient, ops, getUpserted: () => upserted };
}

const input = { targetUserId: 'u1', adminId: 'adm1', adminEmail: 'adm@x.com', reason: 'Pediu um tempo' };

Deno.test('normalizeReason apara, limita a 500 caracteres e trata vazio como sem motivo', () => {
  assertEquals(normalizeReason('  Pediu um tempo  '), 'Pediu um tempo');
  assertEquals(normalizeReason('   '), null);
  assertEquals(normalizeReason(undefined), null);
  assertEquals(normalizeReason(42), null);
  assertEquals(normalizeReason('x'.repeat(600))?.length, 500);
});

Deno.test('deactivateAccount registra a desativação, bloqueia o login e remove o push, nessa ordem', async () => {
  const { admin, ops, getUpserted } = makeFakeAdmin();

  await deactivateAccount(admin, input);

  assertEquals(ops, [
    'account_deactivations.upsert',
    `ban.u1=${BAN_FOREVER}`,
    'push_subscriptions.delete.user_id=u1',
  ]);
  const row = getUpserted();
  assertEquals(row.user_id, 'u1');
  assertEquals(row.reason, 'Pediu um tempo');
  assertEquals(row.deactivated_by, 'adm1');
  assertEquals(row.deactivated_by_email, 'adm@x.com');
  assert(!Number.isNaN(Date.parse(row.deactivated_at)));
});

Deno.test('deactivateAccount não bloqueia o login se não conseguir registrar a desativação', async () => {
  const { admin, ops } = makeFakeAdmin({ rowError: new Error('fk') });

  await assertRejects(() => deactivateAccount(admin, input), Error, 'fk');
  assertEquals(ops, ['account_deactivations.upsert']);
});

Deno.test('deactivateAccount desfaz o registro quando o bloqueio do login falha', async () => {
  const { admin, ops } = makeFakeAdmin({ banError: new Error('gotrue fora') });

  await assertRejects(() => deactivateAccount(admin, input), Error, 'gotrue fora');
  assertEquals(ops, [
    'account_deactivations.upsert',
    `ban.u1=${BAN_FOREVER}`,
    'account_deactivations.delete.user_id=u1',
  ]);
});

Deno.test('deactivateAccount conclui mesmo se a limpeza do push falhar', async () => {
  const { admin } = makeFakeAdmin({ pushError: new Error('timeout') });

  await deactivateAccount(admin, input);
});

Deno.test('reactivateAccount libera o login e só então apaga o registro', async () => {
  const { admin, ops } = makeFakeAdmin();

  await reactivateAccount(admin, 'u1');

  assertEquals(ops, ['ban.u1=none', 'account_deactivations.delete.user_id=u1']);
});

Deno.test('reactivateAccount mantém a conta desativada se não conseguir liberar o login', async () => {
  const { admin, ops } = makeFakeAdmin({ banError: new Error('gotrue fora') });

  await assertRejects(() => reactivateAccount(admin, 'u1'), Error, 'gotrue fora');
  assertEquals(ops, ['ban.u1=none']);
});
