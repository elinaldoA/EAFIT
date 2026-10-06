import { db } from './supabase';

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export async function fetchPlanSummary() {
  return (await rpcRows('admin_plan_summary'))[0] || null;
}

export function fetchPlanBreakdown() {
  return rpcRows('admin_plan_breakdown');
}

export function fetchTrainingRhythm(days = 90) {
  return rpcRows('admin_training_rhythm', { days_back: days });
}

// Separa as linhas do breakdown por dimensão e calcula o % que treinou nos
// últimos 30 dias. Grupos com poucos usuários não entram no ranking de pior
// aderência (amostra pequena engana), mas continuam na tabela.
export const MIN_USERS_FOR_FLAG = 3;

export function buildBreakdown(rows) {
  const out = { meta: [], nivel: [] };
  for (const r of rows || []) {
    const users = Number(r.users);
    const row = {
      value: r.value,
      users,
      withPlan: Number(r.with_plan),
      trained30d: Number(r.trained_30d),
      trainedPct: users ? Math.round((Number(r.trained_30d) / users) * 100) : null,
      neverTrained: Number(r.never_trained),
      sessionsPerWeek: r.sessions_per_week === null || r.sessions_per_week === undefined ? null : Number(r.sessions_per_week),
      adherencePct: r.adherence_pct === null || r.adherence_pct === undefined ? null : Number(r.adherence_pct),
      painUsers: Number(r.pain_users),
      painPct: users ? Math.round((Number(r.pain_users) / users) * 100) : null,
    };
    if (out[r.dimension]) out[r.dimension].push(row);
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => b.users - a.users);
    const eligible = out[key].filter(r => r.users >= MIN_USERS_FOR_FLAG && r.adherencePct !== null);
    const worst = eligible.length > 1 ? eligible.reduce((a, b) => (b.adherencePct < a.adherencePct ? b : a)) : null;
    out[key].forEach(r => { r.isWorst = worst !== null && r.value === worst.value; });
  }
  return out;
}

// Preenche os baldes que não apareceram (sem treino) com zero, em ordem.
export function fillBuckets(rows, kind, size) {
  const byBucket = new Map((rows || []).filter(r => r.kind === kind).map(r => [Number(r.bucket), Number(r.sessions)]));
  return Array.from({ length: size }, (_, bucket) => ({ bucket, sessions: byBucket.get(bucket) || 0 }));
}

// Os N baldes com mais treinos (ignora vazios), do maior pro menor.
export function topBuckets(buckets, n = 3) {
  return [...buckets].filter(b => b.sessions > 0).sort((a, b) => b.sessions - a.sessions || a.bucket - b.bucket).slice(0, n);
}
