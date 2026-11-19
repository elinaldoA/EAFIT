import { db } from './supabase';
import { addDaysStr } from './community';

// Desafios da comunidade do EAFIT Run (tabela run_challenges): o time cria um
// desafio com período e meta e quem usa o app entra com um toque. O progresso
// sai das corridas de cada um. SQL em
// supabase/migrations/20270301010000_run_community_challenges.sql.

export const METRIC_LABEL = { km: 'Quilômetros', hours: 'Horas de corrida', runs: 'Número de corridas' };
export const METRIC_UNIT = { km: 'km', hours: 'h', runs: 'corridas' };
export const TITLE_MAX = 60;
export const DESC_MAX = 300;
export const MAX_DAYS = 92;

export const EMPTY_CHALLENGE = { title: '', description: '', metric: 'km', goal: '', start_date: '', end_date: '' };

const num = v => Number(String(v ?? '').trim().replace(',', '.'));

export function toDraft(row) {
  const draft = { ...EMPTY_CHALLENGE };
  for (const k of Object.keys(EMPTY_CHALLENGE)) {
    if (row?.[k] == null) continue;
    draft[k] = String(row[k]).replace('.', k === 'goal' ? ',' : '.');
  }
  if (draft.goal.endsWith(',0')) draft.goal = draft.goal.slice(0, -2);
  return draft;
}

// { ok, errors, value } com os campos no formato da tabela.
export function validateChallenge(draft) {
  const errors = {};
  const title = String(draft.title || '').trim();
  if (title.length < 3 || title.length > TITLE_MAX) errors.title = `Nome de 3 a ${TITLE_MAX} caracteres.`;
  const description = String(draft.description || '').trim();
  if (description.length > DESC_MAX) errors.description = `Até ${DESC_MAX} caracteres.`;
  if (!METRIC_LABEL[draft.metric]) errors.metric = 'Escolha o tipo da meta.';
  const goal = num(draft.goal);
  if (!Number.isFinite(goal) || goal <= 0 || goal > 100000) errors.goal = 'Informe uma meta maior que zero.';
  else if (draft.metric === 'runs' && !Number.isInteger(goal)) errors.goal = 'O número de corridas precisa ser inteiro.';
  const start = draft.start_date;
  const end = draft.end_date;
  const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  if (!isDate(start)) errors.start_date = 'Informe o início.';
  if (!isDate(end)) errors.end_date = 'Informe o fim.';
  if (isDate(start) && isDate(end)) {
    if (end < start) errors.end_date = 'O fim não pode ser antes do início.';
    else if (end > addDaysStr(start, MAX_DAYS)) errors.end_date = `O desafio pode durar até ${MAX_DAYS} dias.`;
  }
  return {
    ok: !Object.keys(errors).length,
    errors,
    value: { title, description: description || null, metric: draft.metric, goal: Math.round(goal * 10) / 10, start_date: start, end_date: end },
  };
}

// 'futuro' | 'ativo' | 'encerrado' (datas "YYYY-MM-DD").
export function challengeSituation(c, today) {
  if (today < c.start_date) return 'futuro';
  if (today > c.end_date) return 'encerrado';
  return 'ativo';
}

// "100 km", "10 h" ou "12 corridas".
export function goalText(c) {
  const g = String(Number(c.goal)).replace('.', ',');
  return `${g} ${METRIC_UNIT[c.metric] || ''}`.trim();
}

// Total de uma linha do relatório na unidade do desafio.
export function valueText(metric, value) {
  const v = Number(value) || 0;
  if (metric === 'runs') return String(Math.round(v));
  return `${(Math.round(v * 10) / 10).toString().replace('.', ',')} ${METRIC_UNIT[metric]}`;
}

export function friendlyChallengeError(err) {
  if (err?.code === '42P01' || err?.code === 'PGRST202') return 'O desafio ainda não existe no banco (aplique a migration 20270301010000).';
  if (String(err?.message || '').includes('row-level security') || String(err?.message || '').includes('forbidden')) return 'Seu papel não permite gerenciar os desafios.';
  return err?.message || 'Erro desconhecido.';
}

export async function fetchRunChallengesAdmin() {
  const { data, error } = await db
    .from('run_challenges')
    .select('id, title, description, metric, goal, start_date, end_date, active, created_at, run_challenge_members(count)')
    .order('start_date', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map(r => ({ ...r, goal: Number(r.goal), members: r.run_challenge_members?.[0]?.count || 0 }));
}

export async function saveRunChallenge(id, value) {
  const query = id ? db.from('run_challenges').update(value).eq('id', id) : db.from('run_challenges').insert(value);
  const { error } = await query;
  if (error) throw error;
}

export async function setRunChallengeActive(id, active) {
  const { error } = await db.from('run_challenges').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteRunChallenge(id) {
  const { error } = await db.from('run_challenges').delete().eq('id', id);
  if (error) throw error;
}

// [{ userId, name, email, value, rank, joinedAt }]
export async function fetchRunChallengeReport(id) {
  const { data, error } = await db.rpc('admin_run_challenge_report', { p_id: id });
  if (error) throw error;
  return (data || []).map(r => ({
    userId: r.arc_user, name: r.arc_name, email: r.arc_email, value: Number(r.arc_value) || 0, rank: Number(r.arc_rank) || 0, joinedAt: r.arc_joined,
  }));
}

export async function removeRunChallengeMember(challengeId, userId) {
  const { error } = await db.from('run_challenge_members').delete().eq('challenge_id', challengeId).eq('user_id', userId);
  if (error) throw error;
}
