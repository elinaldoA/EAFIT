import { db } from './supabase';

// Ranking do mês com o próprio grupo (embaixadores ou influenciadores), por
// cadastros pelo link. O nome dos outros só vem para quem ligou "Mostrar meu
// nome no ranking"; os demais chegam com name null. RPC influencer_ranking
// (supabase/migrations/20261122010000_influencer_ranking.sql e 20261123010000_ambassador_mode.sql).
export const RANKING_TOP = 10;

// offset: 0 = este mês, 1 = mês passado.
export async function fetchProgramRanking(offset = 0) {
  const { data, error } = await db.rpc('influencer_ranking', { p_month_offset: offset });
  if (error) throw error;
  return (data || []).map(r => ({
    position: Number(r.rk_position), name: r.rk_name || null, signups: Number(r.rk_signups) || 0,
    me: !!r.rk_me, public: !!r.rk_public,
  }));
}

export async function setRankingPublic(value) {
  const { error } = await db.rpc('set_my_ranking_public', { p_public: !!value });
  if (error) throw error;
}

// Top N e, se a pessoa ficou de fora, a linha dela no fim (com separador).
export function rankingView(rows, top = RANKING_TOP) {
  const head = rows.slice(0, top);
  const me = rows.find(r => r.me) || null;
  const meOutside = me && !head.includes(me) ? me : null;
  return { head, meOutside, me, total: rows.length };
}
