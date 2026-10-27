import { db } from './supabase';

import { locale, t } from './i18n';
import { FEEDBACK_REPLY_TITLE, NAV_TARGETS, kindTargetKey } from './pushTarget';
// Central de avisos: o que o admin enviou e as notificações automáticas, para
// reler dentro do app mesmo sem push (tabela user_notifications, só leitura
// para o aluno; marcar como lido é pela RPC). O sino mostra só os não lidos:
// marcou como lido, sai da lista. A exportação de dados pede todos.
export const INBOX_PAGE = 30;

// Recados da equipe para embaixadores e influenciadores (kind 'embaixador' ou
// 'influenciador') ficam na aba Recados do modo do programa, não no sino; a
// exportação leva tudo. Cada conta tem um só papel, então os dois kinds juntos
// são sempre os recados dela.
export const PROGRAM_MESSAGE_KINDS = ['embaixador', 'influenciador'];

export async function fetchInbox(limit = INBOX_PAGE, { unreadOnly = true } = {}) {
  let query = db.from('user_notifications')
    .select('id, kind, title, body, created_at, read_at');
  if (unreadOnly) query = query.is('read_at', null).not('kind', 'in', `(${PROGRAM_MESSAGE_KINDS.join(',')})`);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Aba Recados do modo do programa: lidos e não lidos, mais novos primeiro.
export async function fetchProgramMessages(limit = INBOX_PAGE) {
  const { data, error } = await db.from('user_notifications')
    .select('id, title, body, created_at, read_at')
    .in('kind', PROGRAM_MESSAGE_KINDS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function countUnreadProgramMessages() {
  const { count, error } = await db.from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .in('kind', PROGRAM_MESSAGE_KINDS)
    .is('read_at', null);
  if (error) throw error;
  return count || 0;
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

const TARGET_LABELS = {
  feedback: t('Ver resposta'),
  amigos: t('Abrir Amigos'),
  nutricao: t('Abrir Nutrição'),
  peso: t('Abrir peso e fotos'),
  recordes: t('Ver histórico de dores'),
  treino: t('Ir para o treino'),
};

// Pra onde o aviso leva (destino de lib/pushTarget.js + o texto do link) ou
// null quando é só um comunicado, sem tela associada.
export function inboxTarget(item) {
  if (!item) return null;
  const key = item.kind === 'aviso'
    ? (item.title === FEEDBACK_REPLY_TITLE ? 'feedback' : null)
    : kindTargetKey(item.kind);
  return key ? { ...NAV_TARGETS[key], label: TARGET_LABELS[key] } : null;
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
