import { db } from './supabase';

export const METAS = ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia'];
export const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

// Espelha os ids de app-react/src/lib/achievements.js (BADGES) — os dois apps
// não compartilham build, então o rótulo é duplicado aqui só pra exibição.
export const BADGE_LABELS = {
  streak_3: '🔥 Sequência de 3 dias', streak_7: '🔥🔥 Sequência de 7 dias', streak_30: '🔥🔥🔥 Sequência de 30 dias',
  workouts_10: '💪 10 treinos concluídos', workouts_50: '🏋️ 50 treinos concluídos', workouts_100: '🏆 100 treinos concluídos',
  photo_first: '📸 Primeira foto de progresso',
  weight_10: '⚖️ 10 registros de peso',
};

export const SEVERITY_BADGE = { leve: 'badge--ok', moderada: 'badge--warning', forte: 'badge--danger', lesao: 'badge--danger' };
export const SEVERITY_LABEL = { leve: 'Leve', moderada: 'Moderada', forte: 'Forte', lesao: 'Lesão' };

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export async function callAdminAction(action, targetUserId, extra = {}) {
  const { data, error } = await db.functions.invoke('admin-users', {
    body: { action, targetUserId, ...extra },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Epley — mesma fórmula de app-react/src/lib/records.js (sem pacote
// compartilhado entre os dois apps, duplicação deliberada).
export function estimateOneRepMax(weight, reps) {
  const w = parseFloat(weight);
  const r = parseFloat(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || r <= 0) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

// personal_records (tabela) nunca foi escrita por nenhum código — PRs são
// sempre calculados on-the-fly a partir de exercise_sets, igual ao app-react.
export function computePersonalRecords(sets) {
  const bestByExercise = new Map();
  for (const s of sets) {
    const carga = parseFloat(s.carga);
    if (!Number.isFinite(carga)) continue;
    const oneRm = estimateOneRepMax(s.carga, s.reps);
    const prev = bestByExercise.get(s.exercise_name);
    if (!prev || carga > prev.carga) {
      bestByExercise.set(s.exercise_name, { exercise_name: s.exercise_name, carga, oneRm: prev ? Math.max(prev.oneRm ?? 0, oneRm ?? 0) : oneRm });
    } else if (oneRm !== null && oneRm > (prev.oneRm ?? 0)) {
      prev.oneRm = oneRm;
    }
  }
  return [...bestByExercise.values()].sort((a, b) => b.carga - a.carga).slice(0, 12);
}

export async function callGeneratePlan(targetUserId) {
  const { data, error } = await db.functions.invoke('admin-generate-plan', {
    body: { kind: 'workout', targetUserId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
