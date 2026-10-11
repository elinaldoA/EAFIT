import { db } from './supabase';

// Conta desativada pelo admin (painel admin → Ações). O login novo já é
// recusado pelo servidor; esta consulta existe para encerrar a sessão que
// ficou aberta no aparelho. Falha de rede ou de leitura conta como "não
// desativada": o app não pode travar por isso.
export async function isAccountDeactivated() {
  try {
    const { data, error } = await db.rpc('my_account_deactivated');
    return !error && data === true;
  } catch {
    return false;
  }
}
