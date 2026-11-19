import { db } from '../../lib/supabase';
import { parseLocalDate } from '../../lib/utils';
import { t, decimal } from '../../lib/i18n';

// Desafios da comunidade do EAFIT Run: o time do EAFIT cria um desafio com
// período e meta (km, horas ou número de corridas) e quem usa o app entra com
// um toque. O progresso sai das próprias corridas, calculado no banco
// (supabase/migrations/20270301010000_run_community_challenges.sql).

const toChallenge = r => ({
  id: r.rch_id,
  title: r.rch_title,
  description: r.rch_description || '',
  metric: r.rch_metric,
  goal: Number(r.rch_goal) || 0,
  start: r.rch_start,
  end: r.rch_end,
  members: Number(r.rch_members) || 0,
  joined: !!r.rch_joined,
  value: r.rch_value == null ? null : Number(r.rch_value),
  rank: r.rch_rank == null ? null : Number(r.rch_rank),
});

export async function fetchCommunityChallenges() {
  const { data, error } = await db.rpc('my_run_challenges');
  if (error) throw error;
  return (data || []).map(toChallenge);
}

export async function joinCommunityChallenge(id) {
  const { error } = await db.rpc('join_run_challenge', { p_id: id });
  if (error) throw error;
}

export async function leaveCommunityChallenge(id) {
  const { error } = await db.rpc('leave_run_challenge', { p_id: id });
  if (error) throw error;
}

// [{ name, isMe, value, rank }] — os 50 primeiros e, se eu estiver fora, a minha linha.
export async function fetchCommunityRanking(id) {
  const { data, error } = await db.rpc('run_challenge_ranking', { p_id: id });
  if (error) throw error;
  return (data || []).map(r => ({ name: r.rcr_name, isMe: !!r.rcr_is_me, value: Number(r.rcr_value) || 0, rank: Number(r.rcr_rank) || 0 }));
}

// 'upcoming' (ainda não começou), 'running' ou 'ended'. Datas "YYYY-MM-DD".
export function communityStatus(c, today) {
  if (c.end < today) return 'ended';
  if (c.start > today) return 'upcoming';
  return 'running';
}

export const communityDone = c => c.value != null && c.goal > 0 && c.value >= c.goal;

// Fração da meta (0 a 1) para a barra.
export const communityProgress = c => (c.value != null && c.goal > 0 ? Math.max(0, Math.min(1, c.value / c.goal)) : 0);

// Dias que faltam para o fim, contando hoje (o último dia ainda vale). 0 se acabou.
export function communityDaysLeft(c, today) {
  const diff = Math.round((parseLocalDate(c.end) - parseLocalDate(today)) / 86400000) + 1;
  return Math.max(0, diff);
}

// Quantidade na unidade do desafio: "42,5 km", "3 h 30 min" ou "8" (corridas).
export function formatCommunityAmount(metric, value) {
  const v = Math.max(0, Number(value) || 0);
  if (metric === 'km') return t('{v1} km', { v1: decimal((Math.round(v * 10) / 10).toString()) });
  if (metric === 'hours') {
    const totalMin = Math.round(v * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (!h) return t('{v1} min', { v1: m });
    return m ? t('{v1} h {v2} min', { v1: h, v2: m }) : t('{v1} h', { v1: h });
  }
  return String(Math.round(v));
}

// Meta por extenso para o cartão: "Meta: 100 km", "Meta: 10 h", "Meta: 12 corridas".
export function communityGoalText(c) {
  if (c.metric === 'runs') return t('Meta: {v1} corridas', { v1: Math.round(c.goal) });
  return t('Meta: {v1}', { v1: formatCommunityAmount(c.metric, c.goal) });
}

export function communityError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('challenge_ended')) return t('Esse desafio já terminou.');
  if (msg.includes('not_found')) return t('Desafio não encontrado.');
  if (msg.includes('blocked')) return t('⚠️ Sua conta não pode entrar em desafios no momento');
  return t('⚠️ Não deu para concluir — tente de novo');
}
