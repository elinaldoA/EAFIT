import { db } from './supabase';

import { locale, t } from './i18n';
// Central de avisos: o que o admin enviou e as notificações automáticas, para
// reler dentro do app mesmo sem push (tabela user_notifications, só leitura
// para o aluno; marcar como lido é pela RPC).
export async function fetchInbox(limit = 30) {
  const { data, error } = await db.from('user_notifications')
    .select('id, kind, title, body, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markInboxRead() {
  const { error } = await db.rpc('mark_notifications_read');
  if (error) throw error;
}

// Um aviso só (supabase/migrations/20261030010000_notification_read_one.sql).
export async function markInboxItemRead(id) {
  const { error } = await db.rpc('mark_notification_read', { p_id: id });
  if (error) throw error;
}

// "agora", "há 5 min", "há 3 h", "ontem" ou a data.
export function timeAgo(iso, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('agora');
  if (min < 60) return t('há {min} min', { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('há {h} h', { h });
  const d = Math.floor(h / 24);
  if (d === 1) return t('ontem');
  if (d < 7) return t('há {d} dias', { d });
  return new Date(iso).toLocaleDateString(locale);
}
