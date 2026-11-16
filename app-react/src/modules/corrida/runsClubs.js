import { db } from '../../lib/supabase';
import { t } from '../../lib/i18n';

// Clubes de corrida do EAFIT Run.
// (reexportado por runs.js: quem importa de ./runs continua igual)

// ---- Clubes de corrida ------------------------------------------------------

export const CLUB_NAME_MAX = 40;
export const CLUB_DESC_MAX = 200;
export const CLUB_LIMIT = 5;

const toClub = c => ({
  id: c.rc_id, name: c.rc_name, description: c.rc_description || '', isOwner: !!c.rc_is_owner,
  code: c.rc_code, members: Number(c.rc_members) || 0,
});

const firstRow = data => (Array.isArray(data) ? data[0] : data);

export async function fetchClubs() {
  const { data, error } = await db.rpc('my_run_clubs');
  if (error) throw error;
  return (data || []).map(toClub);
}

export async function createClub(name, description = '') {
  const { data, error } = await db.rpc('create_run_club', { p_name: name, p_description: description });
  if (error) throw error;
  return toClub(firstRow(data));
}

export async function joinClub(code) {
  const { data, error } = await db.rpc('join_run_club', { p_code: code });
  if (error) throw error;
  return toClub(firstRow(data));
}

export async function leaveClub(id) {
  const { error } = await db.rpc('leave_run_club', { p_club: id });
  if (error) throw error;
}

export async function deleteClub(id) {
  const { error } = await db.rpc('delete_run_club', { p_club: id });
  if (error) throw error;
}

// period: 'week' | 'month'. [{ name, isMe, meters, runs, hidden, rank }]
export async function fetchClubRanking(id, period = 'week') {
  const { data, error } = await db.rpc('run_club_ranking', { p_club: id, p_period: period });
  if (error) throw error;
  return rankRows((data || []).map(r => ({
    name: r.cr_name, isMe: !!r.cr_is_me, meters: Number(r.cr_meters) || 0, runs: Number(r.cr_runs) || 0, hidden: !!r.cr_hidden,
  })));
}

// Posição de cada um: empate de km divide a posição; quem ocultou fica sem posição.
export function rankRows(rows) {
  let rank = 0;
  let last = null;
  let seen = 0;
  return rows.map(r => {
    if (r.hidden) return { ...r, rank: null };
    seen += 1;
    if (r.meters !== last) { rank = seen; last = r.meters; }
    return { ...r, rank };
  });
}

// Meta coletiva do mês (km) ou null. Sem a migration, ou em qualquer falha, o
// clube só fica sem meta: o ranking não depende dela.
export async function fetchClubGoal(id) {
  const { data, error } = await db.rpc('run_club_goal', { p_club: id });
  if (error) return null;
  return Number.isFinite(data) && data > 0 ? data : null;
}

// km: 10 a 100000, ou null para tirar a meta. Só o dono.
export async function setClubGoal(id, km) {
  const { error } = await db.rpc('set_run_club_goal', { p_club: id, p_km: km });
  if (error) throw error;
}

export const CLUB_GOAL_MIN = 10;
export const CLUB_GOAL_MAX = 100000;

// Progresso da meta pelo ranking do mês: soma dos km de quem aparece (quem
// ocultou a atividade não entra na soma). { doneKm, pct (0 a 100), leftKm, done }.
export function clubGoalProgress(rows, goalKm) {
  const meters = (rows || []).reduce((sum, r) => sum + (r.hidden ? 0 : r.meters), 0);
  const doneKm = Math.round(meters / 100) / 10;
  const pct = goalKm > 0 ? Math.min(100, Math.floor((doneKm / goalKm) * 100)) : 0;
  return { doneKm, pct, leftKm: Math.max(0, Math.round((goalKm - doneKm) * 10) / 10), done: goalKm > 0 && doneKm >= goalKm };
}

export function normalizeClubCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function clubInviteText(club, url) {
  return t('Corre com a gente? 🏃 Entre no clube {name} no EAFIT Run com o código {code} (aba Desafios → Clubes). {url}', { name: club.name, code: club.code, url });
}

// Mensagem para a pessoa a partir do erro do banco.
export function clubError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('invalid_code')) return t('Clube não encontrado. Confira o código.');
  if (msg.includes('too_many_clubs')) return t('Você já está em {v1} clubes. Saia de um para entrar em outro.', { v1: CLUB_LIMIT });
  if (msg.includes('invalid_goal')) return t('A meta do clube vai de {v1} a {v2} km.', { v1: CLUB_GOAL_MIN, v2: CLUB_GOAL_MAX });
  if (msg.includes('club_full')) return t('Esse clube já tem 100 pessoas.');
  if (msg.includes('invalid_name')) return t('O nome do clube precisa ter de 3 a 40 letras.');
  if (msg.includes('blocked_word')) return t('⚠️ O nome ou a descrição tem uma palavra que não é permitida');
  if (msg.includes('rate_limited')) return t('Você criou clubes demais hoje. Tente amanhã.');
  if (msg.includes('blocked')) return t('⚠️ Sua conta não pode criar nem entrar em clubes no momento');
  return t('⚠️ Não deu para concluir — tente de novo');
}
