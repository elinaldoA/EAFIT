import { db } from './supabase';

// Mensagens do formulário de contato do site (public.contact_messages, ver
// supabase/migrations/20261101010000_contact_messages.sql). Quem escreve não
// tem conta; a resposta sai por e-mail, fora do sistema.

export const PAGE_SIZE = 50;

// Chaves precisam bater com o <select name="topic"> de
// app-react/public/landing/sobre/index.html e com o check da tabela.
export const TOPIC_LABELS = {
  duvida: '❓ Dúvida',
  suporte: '🛠️ Suporte',
  personal: '🧑‍🏫 Modo Personal',
  sugestao: '💡 Sugestão',
  outro: '✉️ Outro',
};

export const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'respondido', label: 'Respondido' },
];
export const STATUS_BADGE = { novo: 'badge--warning', respondido: 'badge--ok' };

export async function fetchContactMessages({ status = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  let query = db.from('contact_messages')
    .select('id, name, email, topic, message, lang, status, created_at, handled_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

export async function setContactStatus(id, status) {
  const { error } = await db.from('contact_messages').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteContactMessage(id) {
  const { error } = await db.from('contact_messages').delete().eq('id', id);
  if (error) throw error;
}

// Link que abre o programa de e-mail já com destinatário, assunto e a
// mensagem original citada.
export function replyMailto(item) {
  const en = item.lang === 'en';
  const subject = en ? 'Re: your message to EAFIT' : 'Re: sua mensagem para o EAFIT';
  const quoted = String(item.message || '').split('\n').map(line => `> ${line}`).join('\n');
  const body = `${en ? 'Hi' : 'Olá'} ${item.name},\n\n\n\n${quoted}`;
  return `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
