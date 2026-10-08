import { db } from './supabase';
import { trackFeature } from './tracking';

import { t } from './i18n';
export const FEEDBACK_KINDS = [
  { value: 'sugestao', label: t('💡 Sugestão') },
  { value: 'problema', label: t('🐞 Problema') },
  { value: 'elogio', label: t('❤️ Elogio') },
];

export const MIN_LENGTH = 5;
export const MAX_LENGTH = 1000;

// Devolve { ok, message, error }: texto aparado e a mensagem de erro (em
// português) quando não dá pra enviar.
export function validateFeedback(kind, text) {
  const message = String(text || '').trim();
  if (!FEEDBACK_KINDS.some(k => k.value === kind)) return { ok: false, message, error: t('Escolha o tipo.') };
  if (message.length < MIN_LENGTH) return { ok: false, message, error: t('Escreva um pouco mais para a gente entender.') };
  if (message.length > MAX_LENGTH) return { ok: false, message, error: t('Máximo de {MAX_LENGTH} caracteres.', { MAX_LENGTH }) };
  return { ok: true, message, error: '' };
}

// O banco limita a 5 envios por dia: a recusa vem como violação de RLS.
export function friendlyFeedbackError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('row-level security')) return t('Você já enviou vários feedbacks hoje. Tente de novo amanhã.');
  return t('Não foi possível enviar agora. Tente novamente.');
}

export async function sendFeedback(userId, kind, message) {
  trackFeature('feedback');
  const { error } = await db.from('feedback').insert({
    user_id: userId,
    kind,
    message,
    context: String(navigator.userAgent || '').slice(0, 200),
  });
  if (error) throw error;
}

// Feedbacks do próprio usuário que a equipe já respondeu (mais recentes
// primeiro). Falha (offline, migration pendente) vira lista vazia.
export async function fetchMyReplies(limit = 5) {
  const { data, error } = await db.from('feedback')
    .select('id, message, admin_reply, replied_at')
    .not('admin_reply', 'is', null)
    .order('replied_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}
