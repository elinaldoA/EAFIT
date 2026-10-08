import { db } from './supabase';
import { BADGE_LABELS } from './userDetailHelpers';

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

const num = v => (v === null || v === undefined ? null : Number(v));

// % inteiro; null quando não há base (evita "0%" enganoso sem ninguém).
export function pct(part, total) {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.round((Number(part) / t) * 100);
}

export function formatMl(ml) {
  if (ml === null || ml === undefined) return '—';
  return `${(Number(ml) / 1000).toFixed(1).replace('.', ',')} L`;
}

// Nota de 1 a 5 do check-in: baixa (<= 2), média ou boa (>= 4).
export function scoreLevel(v) {
  if (v === null || v === undefined) return 'none';
  if (v <= 2) return 'low';
  if (v >= 4) return 'high';
  return 'mid';
}

export const SCORE_BADGE = { low: 'badge--danger', mid: 'badge--warning', high: 'badge--ok', none: '' };

export async function fetchWellbeingOverview(days = 30) {
  const r = (await rpcRows('admin_wellbeing_overview', { days_back: days }))[0];
  if (!r) return null;
  return {
    users: Number(r.wo_users),
    checkinUsers: Number(r.wo_checkin_users), checkins: Number(r.wo_checkins),
    energy: num(r.wo_energy), sleep: num(r.wo_sleep), mood: num(r.wo_mood),
    lowUsers: Number(r.wo_low_users),
    measureUsers: Number(r.wo_measure_users), measures: Number(r.wo_measures),
    waterUsers: Number(r.wo_water_users), waterDays: Number(r.wo_water_days),
    waterAvgMl: num(r.wo_water_avg_ml), waterHitDays: Number(r.wo_water_hit_days),
  };
}

export async function fetchWellbeingByDay(days = 30) {
  return (await rpcRows('admin_wellbeing_by_day', { days_back: days })).map(r => ({
    day: r.wd_day, checkins: Number(r.wd_checkins),
    energy: num(r.wd_energy), sleep: num(r.wd_sleep), mood: num(r.wd_mood),
    waterUsers: Number(r.wd_water_users), waterAvgMl: num(r.wd_water_avg_ml), waterHits: Number(r.wd_water_hits),
  }));
}

export async function fetchLowCheckinUsers(days = 30) {
  return (await rpcRows('admin_low_checkin_users', { days_back: days, max_rows: 50 })).map(r => ({
    userId: r.lc_user, email: r.lc_email, name: r.lc_name, checkins: Number(r.lc_checkins),
    energy: num(r.lc_energy), sleep: num(r.lc_sleep), mood: num(r.lc_mood), last: r.lc_last,
  }));
}

// Separa a linha '__total__' das linhas por exercício.
export function splitCardio(rows) {
  const list = (rows || []).map(r => ({
    exercise: r.cs_exercise, sessions: Number(r.cs_sessions), users: Number(r.cs_users),
    minutes: Number(r.cs_minutes), km: Number(r.cs_km),
  }));
  return {
    total: list.find(r => r.exercise === '__total__') || { sessions: 0, users: 0, minutes: 0, km: 0 },
    exercises: list.filter(r => r.exercise !== '__total__'),
  };
}

export async function fetchCardio(days = 30) {
  return splitCardio(await rpcRows('admin_cardio_summary', { days_back: days }));
}

// Junta as contagens às conquistas conhecidas (as que ninguém desbloqueou
// entram com zero — é justamente o que interessa ver) e ordena da mais comum
// para a mais rara.
export function buildAchievements(rows, labels = BADGE_LABELS) {
  const base = Number((rows || []).find(r => r.as_badge === '__users__')?.as_users ?? 0);
  const counts = new Map((rows || []).filter(r => r.as_badge !== '__users__').map(r => [r.as_badge, r]));
  const ids = [...new Set([...Object.keys(labels), ...counts.keys()])];
  const list = ids.map(id => {
    const users = Number(counts.get(id)?.as_users ?? 0);
    return { id, label: labels[id] || id, users, pct: pct(users, base), last: counts.get(id)?.as_last || null };
  }).sort((a, b) => b.users - a.users || a.label.localeCompare(b.label));
  return { base, list };
}

export async function fetchAchievements() {
  return buildAchievements(await rpcRows('admin_achievement_stats'));
}

export async function fetchRecordStats(days = 90) {
  return (await rpcRows('admin_record_stats', { days_back: days, max_rows: 15 })).map(r => ({
    exercise: r.rs_exercise, users: Number(r.rs_users), top: Number(r.rs_top),
    avgBest: Number(r.rs_avg_best), sets: Number(r.rs_sets),
  }));
}

// Dados de bem-estar de UM usuário, para o detalhe dele.
export async function fetchUserWellbeing(userId) {
  const [checkins, measures] = await Promise.all([
    db.from('daily_checkins').select('id, checkin_date, energy, sleep, mood')
      .eq('user_id', userId).order('checkin_date', { ascending: false }).limit(14),
    db.from('body_measurements').select('id, measured_on, cintura, quadril, peito, braco, coxa')
      .eq('user_id', userId).order('measured_on', { ascending: false }).limit(10),
  ]);
  if (checkins.error) throw checkins.error;
  if (measures.error) throw measures.error;
  return { checkins: checkins.data || [], measures: measures.data || [] };
}
