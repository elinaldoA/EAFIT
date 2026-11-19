// Contas de redes conectadas. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';
import { invoke } from './common';

// ---------- contas ----------

export async function fetchAccounts() {
  const { data, error } = await db.from('marketing_accounts')
    .select('id, platform, external_id, name, username, picture_url, parent_id, status, status_detail, token_expires_at, connected_at, last_synced_at, metrics_note')
    .order('platform');
  if (error) throw error;
  return data || [];
}

export function accountLabel(a) {
  if (!a) return 'Conta removida';
  return a.username ? `@${a.username}` : a.name;
}

// Leva para o login da Meta, do TikTok ou do Google (YouTube); a volta cai em #/marketing-contas.
export async function startConnect(provider) {
  const { url } = await invoke('marketing-oauth', { provider });
  window.location.assign(url);
}

export async function disconnectAccount(id) {
  const { error } = await db.rpc('marketing_disconnect', { p_account: id });
  if (error) throw error;
}
