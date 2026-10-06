import { db } from './supabase';

export const FEEDBACK_KINDS = [
  { value: 'sugestao', label: '💡 Sugestão' },
  { value: 'problema', label: '🐞 Problema' },
  { value: 'elogio', label: '❤️ Elogio' },
];

export const MIN_LENGTH = 5;
export const MAX_LENGTH = 1000;

// Devolve { ok, message, error }: texto aparado e a mensagem de erro (em
// português) quando não dá pra enviar.
export function validateFeedback(kind, text) {
  const message = String(text || '').trim();
  if (!FEEDBACK_KINDS.some(k => k.value === kind)) return { ok: false, message, error: 'Escolha o tipo.' };
  if (message.length < MIN_LENGTH) return { ok: false, message, error: 'Escreva um pouco mais para a gente entender.' };
  if (message.length > MAX_LENGTH) return { ok: false, message, error: `Máximo de ${MAX_LENGTH} caracteres.` };
  return { ok: true, message, error: '' };
}

// O banco limita a 5 envios por dia: a recusa vem como violação de RLS.
export function friendlyFeedbackError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('row-level security')) return 'Você já enviou vários feedbacks hoje. Tente de novo amanhã.';
  return 'Não foi possível enviar agora. Tente novamente.';
}

export async function sendFeedback(userId, kind, message) {
  const { error } = await db.from('feedback').insert({
    user_id: userId,
    kind,
    message,
    context: String(navigator.userAgent || '').slice(0, 200),
  });
  if (error) throw error;
}
