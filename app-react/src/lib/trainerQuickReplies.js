import { db } from './supabase';
import { MAX_MESSAGE } from './trainerMessages';

import { t } from './i18n';
export const MAX_QUICK_REPLIES = 20;
export const QUICK_LABEL_LEN = 28;

const ERRORS = {
  not_authorized: t('Você não tem acesso a este recurso.'),
  invalid_body: t('Escreva a mensagem (até {MAX_MESSAGE} caracteres).', { MAX_MESSAGE }),
  too_many: t('Você já tem {MAX_QUICK_REPLIES} respostas prontas. Apague alguma para salvar outra.', { MAX_QUICK_REPLIES }),
};

export function friendlyQuickReplyError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível concluir. Tente de novo.');
}

// Sugestões que aparecem enquanto o personal ainda não salvou nenhuma.
export const STARTER_REPLIES = [
  t('Bom treino hoje! 💪'),
  t('Parabéns pela constância, continue assim!'),
  t('Lembre de se hidratar e dormir bem hoje.'),
];

// Rótulo curto do botão: primeira linha, cortada com reticências.
export function quickLabel(body) {
  const flat = String(body || '').replace(/\s+/g, ' ').trim();
  return flat.length <= QUICK_LABEL_LEN ? flat : `${flat.slice(0, QUICK_LABEL_LEN - 1).trimEnd()}…`;
}

// Coloca a resposta na caixa: substitui se estiver vazia, senão acrescenta
// numa nova linha. Respeita o limite de um recado.
export function insertReply(current, reply) {
  const base = String(current || '').trimEnd();
  const next = base ? `${base}\n${reply}` : reply;
  return next.slice(0, MAX_MESSAGE);
}

export async function fetchQuickReplies() {
  const { data, error } = await db.rpc('trainer_quick_replies');
  if (error) throw error;
  return (data || []).map(r => ({ id: r.qr_id, body: r.qr_body }));
}

export async function addQuickReply(body) {
  const { data, error } = await db.rpc('trainer_add_quick_reply', { p_body: body });
  if (error) throw error;
  return data;
}

export async function deleteQuickReply(id) {
  const { error } = await db.rpc('trainer_delete_quick_reply', { p_id: id });
  if (error) throw error;
}
