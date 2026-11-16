import { db } from '../../lib/supabase';
import { t } from '../../lib/i18n';

// Comentários das corridas (run_comments, só pelas funções do banco).
// (reexportado por runs.js: quem importa de ./runs continua igual)

// ---- Comentários (run_comments, só pelas funções do banco) -----------------

const toComment = c => ({
  id: c.rc_id, name: c.rc_name, isMe: !!c.rc_is_me, body: c.rc_body, created_at: c.rc_created_at, canDelete: !!c.rc_can_delete,
});

export const COMMENT_MAX = 280;

export async function fetchRunComments(runId) {
  const { data, error } = await db.rpc('run_comments_list', { p_run: runId });
  if (error) throw error;
  return (data || []).map(toComment);
}

export async function addRunComment(runId, body) {
  const { data, error } = await db.rpc('add_run_comment', { p_run: runId, p_body: body });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return toComment(row);
}

export async function deleteRunComment(id) {
  const { error } = await db.rpc('delete_run_comment', { p_id: id });
  if (error) throw error;
}

export async function reportRunComment(id, reason = 'ofensivo') {
  const { error } = await db.rpc('report_run_comment', { p_id: id, p_reason: reason });
  if (error) throw error;
}

// Mensagem para a pessoa a partir do erro do banco.
export function commentError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('blocked_word')) return t('⚠️ O comentário tem uma palavra que não é permitida');
  if (msg.includes('rate_limited')) return t('⚠️ Muitos comentários seguidos: espere um pouco');
  if (msg.includes('blocked')) return t('⚠️ Sua conta não pode comentar no momento');
  if (msg.includes('not_found')) return t('⚠️ Essa corrida não está mais disponível');
  return t('⚠️ Não deu para enviar — tente de novo');
}
