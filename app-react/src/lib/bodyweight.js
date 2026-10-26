import { db } from './supabase';
import { isTimedItem, parsePlannedSeconds } from './timedSets';

import { t } from './i18n';
// Calistenia: cadeias de progressão (do mais fácil ao mais difícil), prontidão
// para subir de nível e recordes de repetições/tempo. A carga não entra aqui:
// séries com kg seguem a lógica de carga de lib/records.js. Os nomes são os da
// biblioteca (exercise_library), então histórico e vídeos continuam valendo.

export const PROGRESSIONS = [
  { id: 'empurrar', label: t('Empurrar'), steps: [
    'Flexão na Parede', 'Flexão de Braço Inclinada (Mãos no Banco)', 'Flexão de Braço com Joelhos Apoiados',
    'Flexão de Braço', 'Flexão Declinada (Pés no Banco)', 'Flexão Arqueiro', 'Flexão com Um Braço',
  ] },
  { id: 'puxar', label: t('Puxar'), steps: [
    'Barra Fixa Negativa', 'Barra Fixa Assistida com os Pés', 'Barra Fixa (peso corporal)',
    'Barra Fixa com Pegada Aberta', 'Barra Fixa Arqueiro', 'Muscle-Up na Barra',
  ] },
  { id: 'remada', label: t('Remada'), steps: ['Remada Invertida (Peso Corporal)', 'Remada Invertida com Pés Elevados'] },
  { id: 'mergulho', label: t('Mergulho'), steps: ['Mergulho no Banco (Tríceps)', 'Paralelas (Foco Tríceps)', 'Paralelas (Peito)'] },
  { id: 'ombro', label: t('Ombro'), steps: ['Flexão Pike', 'Flexão Pike com Pés Elevados'] },
  { id: 'pernas', label: t('Pernas'), steps: [
    'Agachamento sem Peso', 'Agachamento Unilateral no Banco', 'Pistol Squat Assistido', 'Agachamento Pistol',
  ] },
  { id: 'core', label: t('Core'), steps: [
    'Prancha com Joelhos Apoiados', 'Prancha Frontal Estática', 'Prancha RKC', 'Hollow Hold (Canoa)', 'L-Sit',
  ] },
];

const CHAIN_BY_EXERCISE = new Map();
PROGRESSIONS.forEach(chain => chain.steps.forEach((nome, index) => CHAIN_BY_EXERCISE.set(nome, { chain, index })));

// { chain, index, total, level (1-based), prev, next } ou null fora das cadeias.
export function progressionOf(nome) {
  const hit = CHAIN_BY_EXERCISE.get(nome);
  if (!hit) return null;
  const { chain, index } = hit;
  return {
    chain, index, total: chain.steps.length, level: index + 1,
    prev: chain.steps[index - 1] ?? null,
    next: chain.steps[index + 1] ?? null,
  };
}

// Teto da faixa de reps do plano ("8-10" -> 10, "6-8 cada perna" -> 8, "12" -> 12).
function repCeiling(reps) {
  const m = String(reps ?? '').match(/(\d+)\s*-\s*(\d+)|^\s*(\d+)/);
  if (!m) return null;
  return parseInt(m[2] ?? m[3] ?? m[1], 10);
}

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// Tudo que o app precisa saber de uma série para os cálculos abaixo.
// `exclude` ({ workoutId, setNumber }) tira a série que está sendo avaliada.
export async function fetchBodyweightSets(userId, exerciseName, exclude = {}) {
  const { data, error } = await db
    .from('exercise_sets')
    .select('workout_id, set_number, carga, reps, duracao_s, workouts!inner(user_id, workout_date)')
    .eq('workouts.user_id', userId)
    .eq('exercise_name', exerciseName)
    .eq('completed', true);
  if (error) throw error;
  return (data || [])
    .filter(s => !(exclude.workoutId != null && exclude.setNumber != null
      && s.workout_id === exclude.workoutId && s.set_number === exclude.setNumber))
    .map(s => ({ date: s.workouts.workout_date, carga: num(s.carga), reps: num(s.reps), duracaoS: num(s.duracao_s) }));
}

// Agrupa por sessão, da mais recente para a mais antiga.
export function groupSessions(sets) {
  const byDate = new Map();
  sets.forEach(s => {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  });
  return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, list]) => ({ date, sets: list }));
}

const READY_SESSIONS = 2;

// Diz como está o exercício sem carga: pronto para o próximo nível (bateu o teto
// do plano em todas as séries nas últimas READY_SESSIONS sessões) ou, senão, qual
// marca tentar na próxima. null se não há histórico utilizável ou se houve kg
// (aí vale a progressão por carga de lib/records.js).
export function evaluateProgress(sets, ex) {
  const timed = isTimedItem(ex);
  const ceiling = timed ? parsePlannedSeconds(ex.reps) : repCeiling(ex.reps);
  const planned = parseInt(ex.series, 10) || 0;
  if (!ceiling || !planned) return null;

  const metric = s => (timed ? s.duracaoS : s.reps);
  const sessions = groupSessions(sets.filter(s => metric(s) > 0));
  if (!sessions.length || sets.some(s => s.carga > 0)) return null;

  const hit = sess => sess.sets.length >= planned && sess.sets.every(s => metric(s) >= ceiling);
  const recent = sessions.slice(0, READY_SESSIONS);
  const ready = recent.length === READY_SESSIONS && recent.every(hit);
  const lastBest = Math.max(...sessions[0].sets.map(metric));

  return {
    ready, timed, ceiling, lastBest,
    tryValue: Math.min(ceiling, lastBest + 1),
    unit: timed ? 's' : 'reps',
  };
}

// Melhor repetição e melhor tempo já registrados (séries sem carga).
export function bestMarks(sets) {
  let reps = 0;
  let seconds = 0;
  sets.forEach(s => {
    if (s.carga > 0) return;
    if (s.reps > reps) reps = s.reps;
    if (s.duracaoS > seconds) seconds = s.duracaoS;
  });
  return { reps: reps || null, seconds: seconds || null };
}

// Série concluída sem carga bateu o recorde de repetições ou de tempo? Só
// conta quando já havia uma marca anterior (a primeira vez não é recorde).
export async function checkForBodyweightPR(userId, exerciseName, { reps, duracaoS }, exclude = {}) {
  const previous = bestMarks(await fetchBodyweightSets(userId, exerciseName, exclude));
  const r = num(reps);
  const d = num(duracaoS);
  if (d > 0 && previous.seconds !== null && d > previous.seconds) return { kind: 'time', value: d, previous: previous.seconds };
  if (r > 0 && previous.reps !== null && r > previous.reps) return { kind: 'reps', value: r, previous: previous.reps };
  return null;
}

// ---- Metas ("10 flexões", "30s de prancha") ----

export const MAX_BODYWEIGHT_GOALS = 4;

// Exercícios que dão para escolher como meta: todos os das cadeias.
export const GOAL_EXERCISES = PROGRESSIONS.flatMap(c => c.steps);

export function goalUnit(nome) {
  return progressionOf(nome)?.chain.id === 'core' ? 's' : 'reps';
}

// [{ id, exercise, target, created, achieved? }] — descarta o que vier torto.
export function readBodyweightGoals(user) {
  const raw = user?.user_metadata?.bodyweightGoals;
  if (!Array.isArray(raw)) return [];
  return raw.filter(g => g && typeof g.id === 'string' && typeof g.exercise === 'string' && g.exercise && Number(g.target) > 0);
}

export function newBodyweightGoal(exercise, target, today) {
  return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, exercise, target: Number(target), created: today };
}

// Quanto falta: { current, pct, achieved } a partir das séries do exercício.
export function goalProgress(goal, sets) {
  const marks = bestMarks(sets);
  const current = (goalUnit(goal.exercise) === 's' ? marks.seconds : marks.reps) || 0;
  return {
    current,
    pct: Math.max(0, Math.min(100, Math.round((current / goal.target) * 100))),
    achieved: current >= goal.target,
  };
}
