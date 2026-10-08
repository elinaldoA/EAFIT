import { db } from './supabase';

export const METAS = ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia'];
export const NIVEIS = ['iniciante', 'intermediario', 'avancado'];

// Espelha os ids de app-react/src/lib/achievements.js (BADGES) — os dois apps
// não compartilham build, então o rótulo é duplicado aqui só pra exibição.
export const BADGE_LABELS = {
  streak_3: '🔥 Sequência de 3 dias', streak_7: '🔥🔥 Sequência de 7 dias', streak_30: '🔥🔥🔥 Sequência de 30 dias',
  streak_14: '🔥🔥 Sequência de 14 dias',
  workouts_25: '💪 25 treinos concluídos', workouts_200: '👑 200 treinos concluídos',
  photo_5: '🖼️ 5 fotos de progresso', weight_30: '📉 30 registros de peso',
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

// Fotos novas ficam no Storage privado (storage_path) e precisam de URL
// assinada; as antigas trazem a imagem em image_data. Devolve as fotos com
// image_data pronto para o <img>; sem URL (falha ao assinar), fica null.
const PHOTO_URL_TTL = 3600;

export async function withSignedPhotos(rows) {
  const list = rows || [];
  const paths = list.filter(r => r.storage_path).map(r => r.storage_path);
  const links = {};
  if (paths.length) {
    try {
      const { data } = await db.storage.from('progress-photos').createSignedUrls(paths, PHOTO_URL_TTL);
      (data || []).forEach(x => { if (x.signedUrl) links[x.path] = x.signedUrl; });
    } catch { /* sem link: a foto aparece só com data e nota */ }
  }
  return list.map(r => ({ ...r, image_data: r.storage_path ? links[r.storage_path] || null : r.image_data }));
}

// Correções de suporte no histórico de treino. O admin já tem acesso total a
// workouts/exercise_sets pela policy "admin full access"; aqui só se garante
// que toda correção fica na auditoria.
async function audit(adminId, userId, action, details) {
  const { error } = await db.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: userId, action, details });
  if (error) console.error('audit log:', error.message);
}

// Aceita vírgula decimal; vazio vira null (apaga o valor); inválido/negativo é recusado.
export function parseSetNumber(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return { ok: true, value: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? { ok: true, value: n } : { ok: false };
}

export async function fixWorkoutSet(set, fields, adminId, userId) {
  const { error } = await db.from('exercise_sets')
    .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', set.id);
  if (error) throw error;
  await audit(adminId, userId, 'fixWorkoutSet', {
    exercise: set.exercise_name, set: set.set_number,
    from: { carga: set.carga, reps: set.reps }, to: fields,
  });
}

// Apaga o treino e as séries dele (exercise_sets/exercise_logs caem em cascata).
export async function deleteWorkout(workout, adminId, userId) {
  const { error } = await db.from('workouts').delete().eq('id', workout.id);
  if (error) throw error;
  await audit(adminId, userId, 'deleteWorkout', { workout_date: workout.workout_date, day: workout.day_of_week });
}
