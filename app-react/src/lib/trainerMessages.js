import { db } from './supabase';

export const MAX_MESSAGE = 500;
// Disparado quando o aluno marca os recados como lidos (zera a bolinha na hora).
export const MESSAGES_READ_EVENT = 'eafit:messages-read';

const ERRORS = {
  not_authorized: 'Sem permissão para enviar recados.',
  invalid_body: `Escreva uma mensagem de até ${MAX_MESSAGE} caracteres.`,
  no_recipients: 'Nenhum aluno vinculado para receber.',
  rate_limited: 'Limite diário de recados atingido. Tente amanhã.',
};

export function friendlyMessageError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : 'Não foi possível enviar. Tente de novo.';
}

// O histórico vem uma linha por aluno; um envio para vários alunos tem o mesmo
// instante e o mesmo texto, então agrupa por isso (mais recente primeiro).
export function groupSent(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.at}|${r.body}`;
    if (!groups.has(key)) groups.set(key, { key, at: r.at, body: r.body, kind: r.kind, recipients: [] });
    groups.get(key).recipients.push({ name: r.name, read: !!r.read });
  }
  return [...groups.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function unreadCount(messages) {
  return messages.filter(m => !m.read).length;
}

// "Para 5 alunos", "Para Ana" ou "Para Ana e Bruno".
export function recipientsLabel(recipients) {
  if (recipients.length === 1) return `Para ${recipients[0].name}`;
  if (recipients.length === 2) return `Para ${recipients[0].name} e ${recipients[1].name}`;
  return `Para ${recipients.length} alunos`;
}

// Grava o recado (RPC) e dispara o push. O push é "melhor esforço": se a Edge
// Function não estiver publicada ou falhar, o recado já está salvo e aparece no
// app do aluno do mesmo jeito.
export async function sendMessage(clientIds, body, kind = 'recado') {
  const { data, error } = await db.rpc('trainer_send_message', {
    p_clients: clientIds && clientIds.length ? clientIds : null,
    p_body: body,
    p_kind: kind,
  });
  if (error) throw error;
  const recipients = data || [];
  try {
    await db.functions.invoke('trainer-push', {
      body: { client_ids: recipients, body, title: kind === 'treino' ? 'Novo treino do seu personal' : 'Recado do seu personal' },
    });
  } catch (err) {
    console.warn('trainer-push:', err);
  }
  return recipients.length;
}

export async function fetchSentMessages() {
  const { data, error } = await db.rpc('trainer_sent_messages', { p_limit: 80 });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.msg_id, clientId: r.msg_client, name: r.msg_name, body: r.msg_body, kind: r.msg_kind, at: r.msg_at, read: r.msg_read,
  }));
}

export async function fetchMyMessages(limit = 20) {
  const { data, error } = await db.rpc('my_messages', { p_limit: limit });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.msg_id, trainer: r.msg_trainer, body: r.msg_body, kind: r.msg_kind, at: r.msg_at, read: r.msg_read,
  }));
}

export async function markMessagesRead() {
  const { error } = await db.rpc('mark_messages_read');
  if (error) throw error;
  window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
}

const REPLY_ERRORS = {
  no_trainer: 'Você não tem um personal vinculado.',
  invalid_body: `Escreva uma mensagem de até ${MAX_MESSAGE} caracteres.`,
  rate_limited: 'Limite diário de respostas atingido. Tente amanhã.',
};

export function friendlyReplyError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(REPLY_ERRORS).find(k => msg.includes(k));
  return key ? REPLY_ERRORS[key] : 'Não foi possível enviar. Tente de novo.';
}

function mapThread(rows) {
  return (rows || []).map(r => ({ id: r.th_id, from: r.th_from, body: r.th_body, kind: r.th_kind, at: r.th_at }));
}

// Aluno responde ao personal. O push é "melhor esforço", como em sendMessage.
export async function sendReply(body) {
  const { error } = await db.rpc('client_send_reply', { p_body: body });
  if (error) throw error;
  try {
    await db.functions.invoke('reply-push', { body: {} });
  } catch (err) {
    console.warn('reply-push:', err);
  }
}

export async function fetchMyThread(limit = 40) {
  const { data, error } = await db.rpc('my_thread', { p_limit: limit });
  if (error) throw error;
  return mapThread(data);
}

export async function fetchTrainerThread(clientId, limit = 40) {
  const { data, error } = await db.rpc('trainer_thread', { p_client: clientId, p_limit: limit });
  if (error) throw error;
  return mapThread(data);
}

export async function markThreadRead(clientId) {
  const { error } = await db.rpc('trainer_mark_thread_read', { p_client: clientId });
  if (error) throw error;
}

// { [clientId]: quantidade } de respostas ainda não lidas pelo personal.
export async function fetchUnreadReplies() {
  const { data, error } = await db.rpc('trainer_unread_replies');
  if (error) throw error;
  const out = {};
  for (const r of data || []) out[r.ur_client] = r.ur_count;
  return out;
}
