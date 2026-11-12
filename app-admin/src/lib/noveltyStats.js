import { db } from './supabase';

// Adoção das funções novas (PAR-Q, RIR e tipos de série, técnicas, periodização, corrida).
// Só números agregados vindos de admin_novelty_stats: nada individual de saúde chega ao painel.
export async function fetchNoveltyStats(days = 30) {
  const { data, error } = await db.rpc('admin_novelty_stats', { days_back: days });
  if (error) throw error;
  return data || null;
}

// Inteiro de 0 a 100, ou null quando não há base para o cálculo.
export function pct(part, total) {
  const p = Number(part);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return null;
  return Math.round((p / t) * 100);
}

const n = v => Number(v) || 0;

export const SET_TYPES = [
  { key: 'drop_set', label: 'Drop-set' },
  { key: 'rest_pause', label: 'Rest-pause' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'falha', label: 'Até a falha' },
];

// Resposta crua do banco → o que a tela mostra.
export function buildNovelty(raw) {
  if (!raw) return null;
  const parq = raw.parq || {};
  const sets = raw.sets || {};
  const plans = raw.plans || {};
  const runs = raw.runs || {};
  const users = n(raw.users);
  const setsTotal = n(sets.total);
  const typed = SET_TYPES.map(t => ({ key: t.key, label: t.label, total: n(sets[t.key]), pct: pct(sets[t.key], setsTotal) }));
  return {
    days: n(raw.days),
    users,
    parq: {
      answered: n(parq.answered),
      answeredPct: pct(parq.answered, users),
      withAlert: n(parq.with_alert),
      alertPct: pct(parq.with_alert, parq.answered),
      skipped: n(parq.skipped),
      withNotes: n(parq.with_notes),
    },
    rir: {
      sets: n(sets.with_rir),
      setsPct: pct(sets.with_rir, setsTotal),
      users: n(sets.rir_users),
      usersPct: pct(sets.rir_users, sets.users),
      activeUsers: n(sets.users),
      totalSets: setsTotal,
    },
    types: typed,
    typedUsers: n(sets.typed_users),
    plans: {
      active: n(plans.active),
      withTechnique: n(plans.with_technique),
      techniquePct: pct(plans.with_technique, plans.active),
      techniqueExercises: n(plans.technique_exercises),
      withProgression: n(plans.with_progression),
      progressionPct: pct(plans.with_progression, plans.active),
      withDeload: n(plans.with_deload),
    },
    runs: {
      runners: n(runs.runners),
      runnersPct: pct(runs.runners, users),
      runs: n(runs.runs),
      km: n(runs.km),
      gps: n(runs.gps),
      gpsPct: pct(runs.gps, runs.runs),
    },
  };
}
