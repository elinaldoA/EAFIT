// Desativar/reativar conta (ações do admin em admin-users). O bloqueio do
// login é o banimento do GoTrue; a linha em account_deactivations é o que
// distingue "desativada" de "banida" e guarda motivo, autor e data — ver
// supabase/migrations/20261104010000_account_deactivations.sql.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ~100 anos: o GoTrue não tem banimento "sem fim".
export const BAN_FOREVER = '876000h';
const MAX_REASON = 500;

export function normalizeReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.trim().slice(0, MAX_REASON) || null;
}

export type DeactivateInput = {
  targetUserId: string;
  adminId: string;
  adminEmail: string | null;
  reason: string | null;
};

// A linha entra antes do banimento: é ela que faz o app aberto no aparelho
// encerrar a sessão (my_account_deactivated). Se o banimento falhar, a linha
// sai — conta marcada como desativada mas com login liberado seria pior.
export async function deactivateAccount(admin: SupabaseClient, input: DeactivateInput): Promise<void> {
  const { targetUserId, adminId, adminEmail, reason } = input;

  const { error: rowErr } = await admin.from('account_deactivations').upsert({
    user_id: targetUserId,
    reason,
    deactivated_by: adminId,
    deactivated_by_email: adminEmail,
    deactivated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (rowErr) throw rowErr;

  const { error: banErr } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: BAN_FOREVER });
  if (banErr) {
    await admin.from('account_deactivations').delete().eq('user_id', targetUserId);
    throw banErr;
  }

  // Sem inscrição, nenhum envio de push alcança a conta. O app inscreve o
  // aparelho de novo quando a pessoa voltar a entrar. Falha aqui não desfaz a
  // desativação.
  const { error: pushErr } = await admin.from('push_subscriptions').delete().eq('user_id', targetUserId);
  if (pushErr) console.error('deactivateAccount push_subscriptions error:', pushErr.message);
}

// Libera o login primeiro: se falhar, a conta continua desativada por inteiro.
export async function reactivateAccount(admin: SupabaseClient, targetUserId: string): Promise<void> {
  const { error: banErr } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
  if (banErr) throw banErr;

  const { error: rowErr } = await admin.from('account_deactivations').delete().eq('user_id', targetUserId);
  if (rowErr) throw rowErr;
}
