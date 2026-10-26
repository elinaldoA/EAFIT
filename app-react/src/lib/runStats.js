import { db } from './supabase';
import { todayDate } from '../data/treinoData';
import { parseLocalDate, toDateStr } from './utils';
import { toPositive } from './cardio';

import { t } from './i18n';
// Estatísticas e recordes de corrida a partir do registro de cardio
// (exercise_sets.duracao_min / distancia_km): só entram itens de corrida com
// as duas medidas, concluídos. Ritmo só vale a partir de MIN_PACE_KM.

const RUN_RE = /corrida|trote|longão|longao|fartlek/i;
const MIN_PACE_KM = 1;

export const isRunItem = nome => RUN_RE.test(String(nome ?? ''));

// segundos por km; null sem duração/distância válidas ou em treino curto demais.
export function paceSeconds(durationMin, km) {
  const d = toPositive(durationMin);
  const k = toPositive(km);
  if (!d || !k || k < MIN_PACE_KM) return null;
  return Math.round((d * 60) / k);
}

export function formatPaceSeconds(sec) {
  if (!Number.isFinite(sec)) return '';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// Corridas concluídas: [{ date, nome, minutes, km, workoutId, setNumber }].
export async function fetchRuns(userId, exclude = {}) {
  const { data, error } = await db
    .from('exercise_sets')
    .select('workout_id, set_number, exercise_name, duracao_min, distancia_km, workouts!inner(user_id, workout_date)')
    .eq('workouts.user_id', userId)
    .eq('completed', true)
    .not('distancia_km', 'is', null);
  if (error) throw error;
  return (data || [])
    .filter(s => isRunItem(s.exercise_name))
    .filter(s => !(exclude.workoutId != null && exclude.setNumber != null
      && s.workout_id === exclude.workoutId && s.set_number === exclude.setNumber))
    .map(s => ({
      date: s.workouts.workout_date, nome: s.exercise_name,
      minutes: toPositive(s.duracao_min), km: toPositive(s.distancia_km),
    }))
    .filter(r => r.km > 0);
}

function weekStart(dateStr) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda-feira
  return toDateStr(d);
}

// { count, totalKm, longestKm, longestMin, bestPace (s/km), weeks: [{ start, km }] }
// weeks: as últimas `weeks` semanas (segunda a domingo), da mais antiga à atual.
export function computeRunStats(runs, today = todayDate(), weeks = 4) {
  let totalKm = 0;
  let longestKm = 0;
  let longestMin = 0;
  let bestPace = null;
  const byWeek = new Map();
  runs.forEach(r => {
    totalKm += r.km;
    if (r.km > longestKm) longestKm = r.km;
    if (r.minutes > longestMin) longestMin = r.minutes;
    const p = paceSeconds(r.minutes, r.km);
    if (p !== null && (bestPace === null || p < bestPace)) bestPace = p;
    const ws = weekStart(r.date);
    byWeek.set(ws, (byWeek.get(ws) || 0) + r.km);
  });

  const current = parseLocalDate(weekStart(today));
  const list = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(current);
    d.setDate(d.getDate() - i * 7);
    const start = toDateStr(d);
    list.push({ start, km: Math.round((byWeek.get(start) || 0) * 10) / 10 });
  }
  return {
    count: runs.length,
    totalKm: Math.round(totalKm * 10) / 10,
    longestKm, longestMin, bestPace, weeks: list,
  };
}

// A corrida recém-concluída bateu a maior distância ou o melhor ritmo? Só
// conta quando já havia corrida anterior (a primeira não é recorde).
export async function checkForRunPR(userId, { minutes, km }, exclude = {}) {
  const previous = computeRunStats(await fetchRuns(userId, exclude));
  if (!previous.count) return null;
  const distance = toPositive(km);
  const pace = paceSeconds(minutes, km);
  const out = [];
  if (distance > previous.longestKm) out.push({ kind: 'distance', value: distance });
  if (pace !== null && previous.bestPace !== null && pace < previous.bestPace) out.push({ kind: 'pace', value: pace });
  return out.length ? out : null;
}

export function describeRunPR(pr) {
  return pr.kind === 'distance'
    ? t('maior distância: {v} km', { v: pr.value })
    : t('melhor ritmo: {v}/km', { v: formatPaceSeconds(pr.value) });
}
