// Registro de exclusão de conta (tabela account_deletions): prova de que o
// pedido foi atendido, sem guardar quem era a pessoa. Usado por delete-account
// (a própria pessoa) e admin-users/deleteUser (admin): os treinos são contados
// ANTES de apagar os dados e o registro é gravado só depois que a exclusão deu
// certo.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type DeletionSource = 'self' | 'admin';

// Dias inteiros desde a criação da conta; null se a data não for válida.
export function accountAgeDays(createdAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor((now.getTime() - created) / 86400000));
}

// Conta os treinos da conta que está saindo. Falha na contagem vira null: o
// registro é secundário e não pode impedir a exclusão.
export async function countWorkouts(admin: SupabaseClient, userId: string): Promise<number | null> {
  const { count, error } = await admin.from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return error ? null : count ?? 0;
}

// Grava o registro. Erro aqui só vai para o log da função: a exclusão já
// aconteceu e a pessoa não deve receber erro por causa de uma estatística.
export async function logAccountDeletion(
  admin: SupabaseClient,
  source: DeletionSource,
  createdAt: string | null | undefined,
  workouts: number | null,
): Promise<void> {
  const { error } = await admin.from('account_deletions').insert({
    source, account_age_days: accountAgeDays(createdAt), workouts,
  });
  if (error) console.error('account_deletions:', error.message);
}
