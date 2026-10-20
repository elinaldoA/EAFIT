import { db } from './supabase';
import { deleteFeedEvent, setFeedBlock } from './community';
import { saveSetting } from './appSettings';

// Moderação do feed (Comunidade → Moderação): denúncias do app e sinalização
// por palavras bloqueadas. SQL em supabase/migrations/20261128130000_feed_reports.sql.

export const REASON_LABELS = { ofensivo: 'Ofensivo', spam: 'Spam', falso: 'Informação falsa', outro: 'Outro' };
export const STATUS_LABELS = { aberta: 'Aberta', removida: 'Publicação removida', bloqueado: 'Pessoa bloqueada no feed', ignorada: 'Ignorada' };
export const WORDS_KEY = 'feed_blocked_words';

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export function mapReport(r) {
  return {
    eventId: r.fr_event, userId: r.fr_user, userName: r.fr_user_name, snapshot: r.fr_snapshot,
    reasons: r.fr_reasons || [], notes: r.fr_notes || [], reports: Number(r.fr_reports) || 0,
    first: r.fr_first, last: r.fr_last, status: r.fr_status, userReports: Number(r.fr_user_reports) || 0,
    blocked: !!r.fr_blocked, eventExists: !!r.fr_event_exists,
  };
}

// Lista de palavras: uma por linha ou separadas por vírgula, minúsculas, sem repetir.
export function parseWords(text) {
  return [...new Set(String(text || '').split(/[\n,]/).map(w => w.trim().toLowerCase()).filter(w => w.length >= 2))].slice(0, 200);
}

export async function fetchModeration(status = 'aberta') {
  const [reports, flags, words] = await Promise.all([
    rpcRows('admin_feed_reports', { p_status: status }),
    rpcRows('admin_feed_flags').catch(() => []),
    db.from('app_settings').select('value').eq('key', WORDS_KEY).maybeSingle(),
  ]);
  if (words.error) throw words.error;
  return {
    reports: reports.map(mapReport),
    flags: flags.map(f => ({ eventId: f.ff_event, userId: f.ff_user, name: f.ff_name, text: f.ff_text, word: f.ff_word, at: f.ff_at, blocked: !!f.ff_blocked })),
    words: Array.isArray(words.data?.value?.words) ? words.data.value.words : [],
  };
}

function resolve(report, status) {
  return db.rpc('admin_resolve_feed_reports', { p_event: report.eventId, p_user: report.userId, p_status: status })
    .then(({ error }) => { if (error) throw error; });
}

export async function removePost(report) {
  if (report.eventId && report.eventExists) await deleteFeedEvent(report.eventId);
  await resolve(report, 'removida');
}

export async function blockUser(report) {
  await setFeedBlock(report.userId, true);
  await resolve(report, 'bloqueado');
}

export const ignoreReport = report => resolve(report, 'ignorada');
export const reopenReport = report => resolve(report, 'aberta');

export function saveWords(words, adminId) {
  return saveSetting(WORDS_KEY, { words }, adminId);
}
