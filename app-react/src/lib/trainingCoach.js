import { db } from './supabase';
import { DAY_NAMES, todayDate } from '../data/treinoData';
import { addDays } from './pause';
import { parseLocalDate } from './utils';
import { progressionFromSets, plateauFromSets } from './records';
import { countSetsByMuscle, behindMuscles, plannedMuscles } from './muscleVolume';

// Assistente do dia no Treino: junta check-in, recuperação, semana e histórico
// de cargas numa leitura só, com no máximo um botão. As contas ficam aqui
// (puras); a busca é uma consulta só das últimas semanas.

// Oito semanas: a atual e as sete anteriores completas, para contar a sequência de semanas puxadas.
export const LOOKBACK_DAYS = 56;
// A cada 6 semanas puxadas seguidas, uma leve.
export const DELOAD_EVERY = 6;
// Semana com menos que isso do volume típico conta como leve (ou pausa).
const LIGHT_WEEK_SHARE = 0.7;
// Séries de um músculo ontem que pedem cuidado com ele hoje.
const RECOVERY_MIN_SETS = 4;
// Platôs no plano a partir dos quais vale uma semana leve.
const PLATEAUS_FOR_DELOAD = 3;
const MAX_NOTES = 3;

// Séries concluídas das últimas 8 semanas: { exercise_name, carga, reps, workout_date }.
export async function fetchRecentSets(userId, today = todayDate()) {
  const { data, error } = await db
    .from('exercise_sets')
    .select('exercise_name, carga, reps, workouts!inner(user_id, workout_date)')
    .eq('workouts.user_id', userId)
    .gte('workouts.workout_date', addDays(today, -LOOKBACK_DAYS))
    .lte('workouts.workout_date', today)
    .eq('completed', true);
  if (error) throw error;
  return (data || []).map(s => ({
    exercise_name: s.exercise_name, carga: s.carga, reps: s.reps, workout_date: s.workouts.workout_date,
  }));
}

const hasWork = day => [...day.exercicios, ...day.pos].some(ex => parseInt(ex.series, 10) > 0);

// Dias do plano desta semana (domingo a sábado, como o resto do app) que já
// passaram sem treino concluído, do mais recente para o mais antigo.
export function missedDays(planDays, today, isDone) {
  const todayIdx = parseLocalDate(today).getDay();
  return (planDays || [])
    .filter(d => DAY_NAMES.indexOf(d.dia) < todayIdx && hasWork(d) && !isDone(d.dia))
    .sort((a, b) => DAY_NAMES.indexOf(b.dia) - DAY_NAMES.indexOf(a.dia));
}

// Músculos do dia que receberam bastante volume ontem.
export function sorePlannedMuscles(day, sets, today, libraryMap = null) {
  const yesterday = addDays(today, -1);
  const counts = countSetsByMuscle(sets.filter(s => s.workout_date === yesterday), libraryMap);
  return [...plannedMuscles([day], libraryMap)].filter(m => counts[m] >= RECOVERY_MIN_SETS);
}

// Por exercício do dia: quem está pronto para subir carga e quem travou. Só
// conta sessões anteriores a hoje, para a leitura não mudar no meio do treino.
export function exerciseReadings(day, sets, today) {
  const before = sets.filter(s => s.workout_date < today);
  const ready = [];
  const stuck = [];
  day.exercicios.forEach(ex => {
    if (!(parseInt(ex.series, 10) > 0)) return;
    const mine = before.filter(s => s.exercise_name === ex.nome);
    const plateau = plateauFromSets(mine, ex.reps);
    if (plateau) { stuck.push({ nome: ex.nome, ...plateau }); return; }
    const prog = progressionFromSets(mine, ex.reps);
    if (prog?.hitCeiling) ready.push({ nome: ex.nome, ...prog });
  });
  return { ready, stuck };
}

const weekStart = today => addDays(today, -parseLocalDate(today).getDay());

// Volume (Σ carga × reps) das séries entre duas datas, inclusive.
function volumeBetween(sets, from, to) {
  return sets.reduce((acc, s) => {
    if (s.workout_date < from || s.workout_date > to) return acc;
    const kg = parseFloat(s.carga) * parseFloat(s.reps);
    return Number.isFinite(kg) ? acc + kg : acc;
  }, 0);
}

// Volume desta semana até hoje contra o mesmo trecho da semana passada —
// comparar com a semana inteira faria toda segunda parecer queda.
export function weekVolume(sets, today) {
  const start = weekStart(today);
  const now = volumeBetween(sets, start, today);
  const before = volumeBetween(sets, addDays(start, -7), addDays(today, -7));
  return { now, before, deltaPct: before > 0 ? Math.round(((now - before) / before) * 100) : null };
}

// Semanas puxadas seguidas antes da atual. O ciclo do plano não serve de
// relógio (dura 3 a 6 semanas e renova sozinho); o histórico sim: semana
// vazia ou bem abaixo do volume típico (a mediana) já foi o descanso.
export function hardWeekStreak(sets, today) {
  const start = weekStart(today);
  const vols = Array.from({ length: Math.floor(LOOKBACK_DAYS / 7) - 1 }, (_, i) => {
    const from = addDays(start, -7 * (i + 1));
    return volumeBetween(sets, from, addDays(from, 6));
  });
  const trained = vols.filter(v => v > 0).sort((a, b) => a - b);
  if (!trained.length) return 0;
  const typical = trained[Math.floor(trained.length / 2)];
  const streak = vols.findIndex(v => v < typical * LIGHT_WEEK_SHARE || v === 0);
  return streak === -1 ? vols.length : streak;
}

// Esta é a semana leve? (a sexta depois de cinco puxadas seguidas, ou além)
export const isDeloadWeek = streak => streak >= DELOAD_EVERY - 1;
export const weeksToDeload = streak => Math.max(0, DELOAD_EVERY - 1 - streak);

// A leitura do dia. Devolve { kind, tone, ...dados } ou null; o texto fica no
// componente. Prioridade: o que muda o treino de hoje vem antes do que é só
// informação. today: { day, hasSets, done, started, quick }.
export function buildTrainingCoach({ today, checkin, sore = [], readings, missed = [], behind = [], hardWeeks = 0 }) {
  const notes = [];
  const lowEnergy = checkin && checkin.energy <= 2 && checkin.sleep <= 2;
  // Dormiu mal ou está sem energia: o check-in já pede cautela, então nada de subir carga.
  const holdLoads = checkin && (checkin.energy <= 2 || checkin.sleep <= 2);
  const deload = isDeloadWeek(hardWeeks);
  const ready = readings?.ready || [];
  const stuck = readings?.stuck || [];

  if (today?.hasSets && !today.done) {
    let lead;
    if (lowEnergy) lead = { kind: 'low_energy', tone: 'warn', offerQuick: !today.started && !today.quick };
    else if (sore.length) lead = { kind: 'sore', tone: 'warn', muscles: sore };
    else if (deload) lead = { kind: 'deload_week', tone: '', weeks: hardWeeks };
    else if (stuck.length >= PLATEAUS_FOR_DELOAD) lead = { kind: 'deload_plateaus', tone: 'warn', count: stuck.length };
    else if (ready.length && !holdLoads) lead = { kind: 'ready', tone: 'ok', count: ready.length, energized: checkin?.energy >= 4 };
    // Energia alta ou sono ruim sozinhos o check-in já comenta logo acima.

    // Em semana leve ou dia ruim, sugestão de subir carga atrapalha.
    if (!deload && !holdLoads) ready.forEach(r => notes.push({ kind: 'up', ...r }));
    if (!deload) stuck.forEach(s => notes.push({ kind: 'stuck', ...s }));
    return lead || notes.length ? { ...(lead || { kind: null, tone: '' }), notes: notes.slice(0, MAX_NOTES) } : null;
  }

  const catchup = missed[0] || null;
  if (today?.hasSets && today.done) {
    if (catchup) notes.push({ kind: 'missed_tomorrow', day: catchup });
    if (behind.length) notes.push({ kind: 'behind', muscles: behind.slice(0, 2) });
    return { kind: 'done', tone: 'ok', notes };
  }

  // Dia sem treino no plano.
  if (catchup) return { kind: 'catchup', tone: '', day: catchup, notes: [] };
  return behind.length ? { kind: null, tone: '', notes: [{ kind: 'behind', muscles: behind.slice(0, 2) }] } : null;
}

// Atalho para a página: músculos do plano com pouco volume nos últimos 7 dias.
export function weekBehind(planDays, sets, today, libraryMap = null) {
  const since = addDays(today, -6);
  const counts = countSetsByMuscle(sets.filter(s => s.workout_date >= since), libraryMap);
  return behindMuscles(counts, plannedMuscles(planDays, libraryMap));
}
