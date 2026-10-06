import { db } from './supabase';

export const MAX_MESSAGE = 500;

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
}
