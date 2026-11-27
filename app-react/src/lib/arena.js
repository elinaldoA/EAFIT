import { db } from './supabase';
import { trackFeature } from './tracking';
import { t, decimal } from './i18n';

// EAFIT Arena (supabase/migrations/20270307010000_arena_core.sql): o treino da
// musculação e a corrida do Run somam XP no mesmo personagem. Quem decide o XP,
// o nível e a sequência é o servidor; o app só lê (arena_my) e resgata missão.

export async function fetchArena() {
  const { data, error } = await db.rpc('arena_my');
  if (error) throw error;
  return data || { enabled: false };
}

export async function claimMission(id) {
  const { data, error } = await db.rpc('arena_claim_mission', { p_mission: id });
  if (error) throw error;
  trackFeature('arena_missao');
  return data || { xp: 0 };
}

// Barra do nível: porcentagem já andada e XP que falta para o próximo.
export function levelProgress(arena) {
  const from = Number(arena?.level_from) || 0;
  const to = Number(arena?.level_to) || 0;
  const xp = Number(arena?.xp) || 0;
  const span = to - from;
  const pct = span > 0 ? Math.min(100, Math.max(0, Math.round(((xp - from) / span) * 100))) : 0;
  return { pct, toNext: Math.max(0, to - xp) };
}

// 'gym' vê as missões de musculação e as de qualquer módulo; 'run', as de corrida
// e as de qualquer módulo. Sem módulo, mostra todas.
export function visibleMissions(arena, sport) {
  const list = arena?.missions || [];
  if (!sport) return list;
  return list.filter(m => m.module === 'any' || m.module === sport);
}

const METRIC_LABEL = {
  workouts: (have, target) => t('{have}/{target} treinos', { have, target }),
  runs: (have, target) => t('{have}/{target} corridas', { have, target }),
  run_km: (have, target) => t('{have}/{target} km', { have: decimal(have), target: decimal(target) }),
  active_days: (have, target) => t('{have}/{target} dias ativos', { have, target }),
};

// "2/3 treinos · 0/1 corridas": o que falta em cada meta da missão.
export function progressLabel(progress) {
  return (progress || [])
    .map(p => {
      const target = Number(p.target);
      const have = Math.min(Number(p.have), target);
      return METRIC_LABEL[p.metric]?.(have, target);
    })
    .filter(Boolean)
    .join(' · ');
}

// Atividade (treino/corrida) rende até o teto por dia; o resto é guardado para amanhã.
export function dailyLabel(arena) {
  return t('Hoje: {used}/{cap} XP', { used: arena?.today_xp ?? 0, cap: arena?.daily_cap ?? 0 });
}

// Para o backup: cada XP ganho, o resumo (nível e sequência) e as missões
// resgatadas. A RLS já limita as três tabelas ao próprio usuário.
export async function fetchMyArenaData() {
  const [events, profile, claims, member, seasons, bosses] = await Promise.all([
    db.from('arena_xp_events').select('source, module, xp, day, created_at').order('created_at'),
    db.from('arena_profiles').select('xp_total, level, streak, best_streak, last_day').maybeSingle(),
    db.from('arena_mission_claims').select('mission_id, period_start, xp, claimed_at').order('claimed_at'),
    db.from('arena_members').select('joined_at').maybeSingle(),
    db.from('arena_season_results').select('season_id, xp, position').order('season_id'),
    db.from('arena_boss_claims').select('boss_id, xp, claimed_at').order('claimed_at'),
  ]);
  for (const r of [events, profile, claims, member, seasons, bosses]) if (r.error) throw r.error;
  return {
    xpEvents: events.data || [], profile: profile.data || null, missionClaims: claims.data || [],
    rankingMemberSince: member.data?.joined_at || null, seasonResults: seasons.data || [],
    bossClaims: bosses.data || [],
  };
}

// ── Temporada e ranking (supabase/migrations/20270307030000_arena_seasons.sql) ──
// module: 'all' (geral), 'gym' ou 'run'.
export async function fetchArenaRanking(module = 'all') {
  const { data, error } = await db.rpc('arena_my_ranking', { p_module: module });
  if (error) throw error;
  return data || { enabled: false };
}

export async function joinArenaRanking() {
  const { error } = await db.rpc('join_arena_ranking');
  if (error) throw error;
  trackFeature('arena_ranking');
}

export async function leaveArenaRanking() {
  const { error } = await db.rpc('leave_arena_ranking');
  if (error) throw error;
}

// Medalha do fechamento da temporada: arena_<slug>_<posição> (slug sem "_").
export function parseArenaBadge(id) {
  const m = /^arena_([a-z0-9-]+)_([123])$/.exec(String(id || ''));
  return m ? { slug: m[1], position: Number(m[2]) } : null;
}

// "temporada-1" → "Temporada 1"
export function seasonName(slug) {
  const words = String(slug || '').replace(/-/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

// "2026-12-01" → "01/12"
export function shortDate(iso) {
  const [, m, d] = String(iso || '').split('-');
  return m && d ? `${d}/${m}` : '';
}

// Dias que faltam para o fim (0 = último dia). today e endsOn são "AAAA-MM-DD".
export function seasonDaysLeft(endsOn, today) {
  const a = Date.parse(`${endsOn}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((a - b) / 86400000));
}

// ── Chefão semanal e times (supabase/migrations/20270308010000_arena_teams_boss.sql) ──
export async function fetchArenaBoss() {
  const { data, error } = await db.rpc('arena_my_boss');
  if (error) throw error;
  return data || { enabled: false };
}

export async function claimArenaBoss(id) {
  const { data, error } = await db.rpc('arena_claim_boss', { p_boss: id });
  if (error) throw error;
  trackFeature('arena_chefao');
  return data || { xp: 0 };
}

export async function fetchArenaTeams() {
  const { data, error } = await db.rpc('arena_my_teams');
  if (error) throw error;
  return data || { enabled: false };
}

// Porcentagem da meta do chefão (trava em 100).
export function bossPercent(boss) {
  const goal = Number(boss?.goal) || 0;
  if (goal <= 0) return 0;
  return Math.min(100, Math.round(((Number(boss?.value) || 0) / goal) * 100));
}

// "12 de 40 km", "7 de 10 treinos", "300 de 750 XP"
export function bossAmount(boss, value = boss?.value) {
  const n = Number(value) || 0;
  const goal = Number(boss?.goal) || 0;
  const fmt = v => decimal(String(Math.round(v * 10) / 10));
  if (boss?.metric === 'run_km') return t('{have} de {goal} km', { have: fmt(n), goal: fmt(goal) });
  if (boss?.metric === 'workouts') return t('{have} de {goal} treinos', { have: fmt(n), goal: fmt(goal) });
  return t('{have} de {goal} XP', { have: fmt(n), goal: fmt(goal) });
}

// O que a pessoa colocou no chefão, na unidade dele.
export function bossMine(boss) {
  const n = Number(boss?.mine) || 0;
  const v = decimal(String(Math.round(n * 10) / 10));
  if (boss?.metric === 'run_km') return t('{n} km', { n: v });
  if (boss?.metric === 'workouts') return t('{n} treinos', { n: v });
  return t('{n} XP', { n: v });
}
