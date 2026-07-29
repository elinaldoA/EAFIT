import { db } from './supabase';
import { parseRepCeiling } from './utils';

// Fórmula de Epley — estimativa padrão de 1RM a partir de peso x repetições.
export function estimateOneRepMax(weight, reps) {
  const w = parseFloat(weight);
  const r = parseFloat(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || r <= 0) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

// Busca em 2 passos (todos os workout ids do usuário, depois os sets desse exercício)
// usada como fallback se o embed do Supabase abaixo não for reconhecido no schema.
async function fetchSetsForExerciseFallback(userId, exerciseName) {
  const { data: workouts, error: wErr } = await db
    .from('workouts')
    .select('id')
    .eq('user_id', userId);
  if (wErr) throw wErr;

  const ids = (workouts || []).map(w => w.id);
  if (!ids.length) return [];

  const { data: sets, error } = await db
    .from('exercise_sets')
    .select('workout_id, set_number, carga, reps')
    .in('workout_id', ids)
    .eq('exercise_name', exerciseName)
    .eq('completed', true)
    .not('carga', 'is', null);
  if (error) throw error;
  return sets || [];
}

// Retorna a maior carga e o maior 1RM estimado já registrados para um exercício,
// opcionalmente ignorando uma série específica (a que está sendo avaliada agora).
export async function fetchBestForExercise(userId, exerciseName, exclude = {}) {
  let sets;
  try {
    // Join direto via a FK exercise_sets.workout_id -> workouts.id: evita buscar
    // todos os workout ids do usuário antes (esse array só cresce com o tempo).
    const { data, error } = await db
      .from('exercise_sets')
      .select('workout_id, set_number, carga, reps, workouts!inner(user_id)')
      .eq('workouts.user_id', userId)
      .eq('exercise_name', exerciseName)
      .eq('completed', true)
      .not('carga', 'is', null);
    if (error) throw error;
    sets = data || [];
  } catch (err) {
    console.warn('fetchBestForExercise: embed falhou, usando busca em 2 passos', err);
    sets = await fetchSetsForExerciseFallback(userId, exerciseName);
  }

  let bestCarga = null;
  let bestOneRm = null;
  (sets || []).forEach(s => {
    if (exclude.workoutId != null && exclude.setNumber != null
      && s.workout_id === exclude.workoutId && s.set_number === exclude.setNumber) return;

    const carga = parseFloat(s.carga);
    if (Number.isFinite(carga) && (bestCarga === null || carga > bestCarga)) bestCarga = carga;

    const oneRm = estimateOneRepMax(s.carga, s.reps);
    if (oneRm !== null && (bestOneRm === null || oneRm > bestOneRm)) bestOneRm = oneRm;
  });

  return { bestCarga, bestOneRm };
}

// Mesmo problema/solução de fetchSetsForExerciseFallback, mas trazendo workout_date
// junto (precisa saber qual foi a sessão mais recente pra sugerir a próxima carga).
async function fetchSetsWithDatesFallback(userId, exerciseName) {
  const { data: workouts, error: wErr } = await db
    .from('workouts')
    .select('id, workout_date')
    .eq('user_id', userId);
  if (wErr) throw wErr;

  const dateById = new Map((workouts || []).map(w => [w.id, w.workout_date]));
  const ids = [...dateById.keys()];
  if (!ids.length) return [];

  const { data: sets, error } = await db
    .from('exercise_sets')
    .select('workout_id, carga, reps')
    .in('workout_id', ids)
    .eq('exercise_name', exerciseName)
    .eq('completed', true)
    .not('carga', 'is', null);
  if (error) throw error;
  return (sets || []).map(s => ({ carga: s.carga, reps: s.reps, workout_date: dateById.get(s.workout_id) }));
}

// Busca todas as séries concluídas (com carga, reps e data da sessão) de um
// exercício — usada pra sugestão de carga, detecção de platô e (via
// planEvolution.js) pra classificar a tendência do exercício num ciclo.
export async function fetchExerciseSetsWithDates(userId, exerciseName) {
  try {
    const { data, error } = await db
      .from('exercise_sets')
      .select('carga, reps, workouts!inner(user_id, workout_date)')
      .eq('workouts.user_id', userId)
      .eq('exercise_name', exerciseName)
      .eq('completed', true)
      .not('carga', 'is', null);
    if (error) throw error;
    return (data || []).map(s => ({ carga: s.carga, reps: s.reps, workout_date: s.workouts.workout_date }));
  } catch (err) {
    console.warn('fetchExerciseSetsWithDates: embed falhou, usando busca em 2 passos', err);
    return fetchSetsWithDatesFallback(userId, exerciseName);
  }
}

// Sugere a carga da próxima sessão: se todas as séries da última sessão bateram o
// teto da faixa de reps planejada, sugere +2,5kg; senão, sugere repetir a mesma
// carga e mirar em +1 rep (dupla progressão: sobe rep por rep até bater o teto,
// só então sobe carga). Retorna null se o exercício não tem histórico ou a faixa
// de reps não é numérica (ex.: "até a falha", isometria em segundos, cardio).
export async function fetchProgressionSuggestion(userId, exerciseName, repsStr) {
  const ceiling = parseRepCeiling(repsStr);
  if (ceiling === null) return null;

  const sets = await fetchExerciseSetsWithDates(userId, exerciseName);
  if (!sets.length) return null;

  const lastDate = sets.reduce((max, s) => (s.workout_date > max ? s.workout_date : max), sets[0].workout_date);
  const lastSets = sets.filter(s => s.workout_date === lastDate);
  const lastCarga = Math.max(...lastSets.map(s => parseFloat(s.carga)).filter(Number.isFinite));
  if (!Number.isFinite(lastCarga)) return null;

  const setsAtLastCarga = lastSets.filter(s => parseFloat(s.carga) === lastCarga);
  const hitCeiling = setsAtLastCarga.every(s => parseInt(s.reps, 10) >= ceiling);
  const lastReps = Math.max(...setsAtLastCarga.map(s => parseInt(s.reps, 10)));

  return {
    lastCarga,
    lastReps,
    suggestedCarga: hitCeiling ? lastCarga + 2.5 : lastCarga,
    suggestedReps: hitCeiling ? null : Math.min(ceiling, lastReps + 1),
    hitCeiling,
  };
}

const PLATEAU_SESSIONS = 3;
// Detecta estagnação: olha as últimas PLATEAU_SESSIONS sessões distintas do
// exercício (maior carga de cada uma). Se a carga não mudou, os reps não
// melhoraram e o teto da faixa nunca foi batido em nenhuma delas, sugere um
// deload de 10%. Retorna null se faltar histórico, a faixa de reps não for
// numérica, ou a carga/reps ainda estiverem progredindo normalmente.
export async function fetchPlateauStatus(userId, exerciseName, repsStr) {
  const ceiling = parseRepCeiling(repsStr);
  if (ceiling === null) return null;

  const sets = await fetchExerciseSetsWithDates(userId, exerciseName);
  if (!sets.length) return null;

  const bestByDate = new Map();
  sets.forEach(s => {
    const carga = parseFloat(s.carga);
    const reps = parseInt(s.reps, 10);
    if (!Number.isFinite(carga) || !Number.isFinite(reps)) return;
    const prev = bestByDate.get(s.workout_date);
    if (!prev || carga > prev.carga || (carga === prev.carga && reps > prev.reps)) {
      bestByDate.set(s.workout_date, { carga, reps });
    }
  });

  const recentDates = [...bestByDate.keys()].sort().reverse().slice(0, PLATEAU_SESSIONS);
  if (recentDates.length < PLATEAU_SESSIONS) return null;

  const sessions = recentDates.map(d => bestByDate.get(d)).reverse(); // mais antiga primeiro
  const first = sessions[0];
  const cargaFrozen = sessions.every(s => s.carga === first.carga);
  const noRepProgress = sessions[sessions.length - 1].reps <= first.reps;
  const neverHitCeiling = sessions.every(s => s.reps < ceiling);

  if (!cargaFrozen || !noRepProgress || !neverHitCeiling) return null;

  return {
    sessionsStuck: PLATEAU_SESSIONS,
    lastCarga: first.carga,
    suggestedDeload: Math.round(first.carga * 0.9 * 2) / 2, // arredonda pra 0,5kg
  };
}

// Compara a série recém-concluída com o histórico e diz se ela bateu algum recorde.
export async function checkForNewPR(userId, exerciseName, carga, reps, exclude = {}) {
  const cargaNum = parseFloat(carga);
  if (!Number.isFinite(cargaNum)) return null;

  const { bestCarga, bestOneRm } = await fetchBestForExercise(userId, exerciseName, exclude);
  const newOneRm = estimateOneRepMax(carga, reps);

  const isCargaPR = bestCarga === null || cargaNum > bestCarga;
  const isOneRmPR = newOneRm !== null && (bestOneRm === null || newOneRm > bestOneRm);

  if (isCargaPR || isOneRmPR) return { isCargaPR, isOneRmPR, carga: cargaNum, oneRm: newOneRm };
  return null;
}
