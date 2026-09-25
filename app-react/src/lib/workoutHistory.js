import { db } from './supabase';
import { parseLocalDate, toDateStr } from './utils';

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Primeiro e último dia ("YYYY-MM-DD") do mês — month é 0-based, como no Date.
export function monthRange(year, month) {
  return {
    from: toDateStr(new Date(year, month, 1, 12)),
    to: toDateStr(new Date(year, month + 1, 0, 12)),
  };
}

// Grade do calendário começando na segunda-feira (mesma convenção do heatmap
// da Evolução): semanas de 7 células, com null nas sobras antes do dia 1 e
// depois do último dia.
export function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const lead = (first.getDay() + 6) % 7; // segunda = 0 … domingo = 6
  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateStr(new Date(year, month, d, 12)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Volume (Σ carga × reps) compacto: toneladas a partir de 10t.
export function fmtVolume(kg) {
  return kg >= 10000
    ? `${(kg / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}t`
    : `${Math.round(kg).toLocaleString('pt-BR')}kg`;
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Maior carga entre as séries concluídas e o maior nº de reps feito com ela.
function bestSet(sets) {
  let best = null;
  sets.forEach(s => {
    if (!s.done || s.carga === null) return;
    if (!best || s.carga > best.carga || (s.carga === best.carga && (s.reps ?? 0) > (best.reps ?? 0))) {
      best = { carga: s.carga, reps: s.reps };
    }
  });
  return best;
}

// Junta workouts + exercise_sets em sessões prontas pra tela. Descarta os
// workouts "vazios" — o app cria uma linha pra cada dia do plano da semana ao
// abrir (ensureWorkoutId), então a maioria das linhas nunca foi treinada.
export function buildSessions(workouts, sets) {
  const setsByWorkout = new Map();
  (sets || []).forEach(s => {
    if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, []);
    setsByWorkout.get(s.workout_id).push(s);
  });

  return (workouts || [])
    .map(w => {
      const byExercise = new Map();
      (setsByWorkout.get(w.id) || [])
        .slice()
        .sort((a, b) => a.set_number - b.set_number)
        .forEach(s => {
          if (!byExercise.has(s.exercise_name)) byExercise.set(s.exercise_name, []);
          byExercise.get(s.exercise_name).push({
            n: s.set_number, carga: toNum(s.carga), reps: toNum(s.reps), done: !!s.completed,
          });
        });

      let doneSets = 0;
      let totalCarga = 0;
      let volume = 0;
      const exercises = [...byExercise.entries()]
        .map(([nome, exSets]) => {
          exSets.forEach(s => {
            if (!s.done) return;
            doneSets++;
            if (s.carga !== null) {
              totalCarga += s.carga;
              if (s.reps !== null) volume += s.carga * s.reps;
            }
          });
          return { nome, sets: exSets, best: bestSet(exSets) };
        })
        .filter(ex => ex.sets.some(s => s.done || s.carga !== null || s.reps !== null));

      return {
        id: w.id,
        date: w.workout_date,
        dayOfWeek: w.day_of_week,
        completed: !!w.completed,
        durationSeconds: w.duration_seconds ?? null,
        rating: w.rating ?? null,
        notes: w.notes || '',
        exercises,
        doneSets,
        totalCarga,
        volume,
      };
    })
    .filter(s => s.completed || s.doneSets > 0 || (s.durationSeconds ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeMonth(sessions) {
  return sessions.reduce((acc, s) => ({
    treinos: acc.treinos + (s.completed ? 1 : 0),
    seconds: acc.seconds + (s.durationSeconds || 0),
    sets: acc.sets + s.doneSets,
    volume: acc.volume + s.volume,
  }), { treinos: 0, seconds: 0, sets: 0, volume: 0 });
}

// Pra cada exercício, a melhor série da sessão mais recente em que ele
// apareceu (rows já vêm filtradas pra antes da sessão comparada).
export function previousBestByExercise(rows) {
  const latest = new Map();
  (rows || []).forEach(r => {
    const carga = toNum(r.carga);
    if (carga === null) return;
    const reps = toNum(r.reps);
    const prev = latest.get(r.exercise_name);
    if (!prev || r.workout_date > prev.date) {
      latest.set(r.exercise_name, { date: r.workout_date, carga, reps });
    } else if (r.workout_date === prev.date
      && (carga > prev.carga || (carga === prev.carga && (reps ?? 0) > (prev.reps ?? 0)))) {
      latest.set(r.exercise_name, { date: prev.date, carga, reps });
    }
  });
  return latest;
}

// Tendência de cada exercício da sessão contra a vez anterior: sobe/desce pela
// carga e, com a mesma carga, pelas reps (dupla progressão, igual a records.js).
export function compareExercise(best, previous) {
  if (!best) return { trend: 'none' };
  if (!previous) return { trend: 'new' };
  const deltaCarga = Math.round((best.carga - previous.carga) * 10) / 10;
  const deltaReps = (best.reps ?? 0) - (previous.reps ?? 0);
  let trend = 'same';
  if (deltaCarga > 0 || (deltaCarga === 0 && deltaReps > 0)) trend = 'up';
  else if (deltaCarga < 0 || (deltaCarga === 0 && deltaReps < 0)) trend = 'down';
  return { trend, deltaCarga, deltaReps, previous };
}

export async function fetchMonthSessions(userId, year, month) {
  const { from, to } = monthRange(year, month);
  const { data: workouts, error } = await db
    .from('workouts')
    .select('id, workout_date, day_of_week, completed, duration_seconds, rating, notes')
    .eq('user_id', userId)
    .gte('workout_date', from)
    .lte('workout_date', to);
  if (error) throw error;

  const ids = (workouts || []).map(w => w.id);
  if (!ids.length) return [];

  const { data: sets, error: sErr } = await db
    .from('exercise_sets')
    .select('workout_id, exercise_name, set_number, carga, reps, completed')
    .in('workout_id', ids);
  if (sErr) throw sErr;

  return buildSessions(workouts, sets);
}

const COMPARE_WINDOW_DAYS = 120;

// Busca as séries concluídas dos mesmos exercícios nos últimos meses antes da
// sessão — janela limitada pra consulta não crescer com o histórico inteiro.
export async function fetchPreviousBests(userId, exerciseNames, beforeDate) {
  if (!exerciseNames.length) return new Map();
  const since = parseLocalDate(beforeDate);
  since.setDate(since.getDate() - COMPARE_WINDOW_DAYS);

  const { data, error } = await db
    .from('exercise_sets')
    .select('exercise_name, carga, reps, workouts!inner(user_id, workout_date)')
    .eq('workouts.user_id', userId)
    .lt('workouts.workout_date', beforeDate)
    .gte('workouts.workout_date', toDateStr(since))
    .in('exercise_name', exerciseNames)
    .eq('completed', true)
    .not('carga', 'is', null);
  if (error) throw error;

  return previousBestByExercise(
    (data || []).map(r => ({ exercise_name: r.exercise_name, carga: r.carga, reps: r.reps, workout_date: r.workouts.workout_date }))
  );
}
