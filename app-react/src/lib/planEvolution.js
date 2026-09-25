import { db } from './supabase';
import { fetchExerciseSetsWithDates } from './records';
import { fetchWeightLogs } from './weightLog';
import { todayDate } from '../data/treinoData';
import { parseLocalDate, toDateStr } from './utils';

const DISCOMFORT_LOOKBACK_DAYS = 14;
const MIN_ADHERENCE = 0.5;

// Direção de peso que conta como "a favor" do objetivo — metas que não são
// sobre a balança (força, saúde, definição) não entram nessa conta.
const WEIGHT_GOAL_DIRECTION = { massa: 'up', emagrecer: 'down' };

function daysAgo(days) {
  const d = parseLocalDate(todayDate());
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}

// Compara a melhor série (maior carga, depois maior reps) da sessão mais
// antiga do ciclo com a da mais recente. Retorna null se o exercício não tem
// pelo menos 2 sessões distintas dentro do ciclo (dado insuficiente).
async function classifyExerciseTrend(userId, exerciseName, sinceDate) {
  const sets = await fetchExerciseSetsWithDates(userId, exerciseName);
  const inCycle = sets
    .map(s => ({ carga: parseFloat(s.carga), reps: parseInt(s.reps, 10), workout_date: s.workout_date }))
    .filter(s => Number.isFinite(s.carga) && Number.isFinite(s.reps) && s.workout_date >= sinceDate);
  if (!inCycle.length) return null;

  const bestByDate = new Map();
  inCycle.forEach(s => {
    const prev = bestByDate.get(s.workout_date);
    if (!prev || s.carga > prev.carga || (s.carga === prev.carga && s.reps > prev.reps)) {
      bestByDate.set(s.workout_date, s);
    }
  });
  const dates = [...bestByDate.keys()].sort();
  if (dates.length < 2) return null;

  const first = bestByDate.get(dates[0]);
  const last = bestByDate.get(dates[dates.length - 1]);
  if (last.carga > first.carga || (last.carga === first.carga && last.reps > first.reps)) return 'progrediu';
  if (last.carga < first.carga || (last.carga === first.carga && last.reps < first.reps)) return 'regrediu';
  return 'estagnou';
}

// +1 se o peso andou na direção do objetivo do ciclo, -1 se andou contra,
// 0 se o objetivo não depende da balança ou não há dado suficiente.
async function weightSignal(userId, meta, sinceDate) {
  const direction = WEIGHT_GOAL_DIRECTION[meta?.meta];
  if (!direction) return 0;

  const logs = (await fetchWeightLogs(userId)).filter(l => l.log_date >= sinceDate);
  if (logs.length < 2) return 0;

  const first = logs[0].peso;
  const last = logs[logs.length - 1].peso;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === last) return 0;

  const wentUp = last > first;
  const matchedGoal = (direction === 'up' && wentUp) || (direction === 'down' && !wentUp);
  return matchedGoal ? 1 : -1;
}

// Override de segurança: qualquer relato "forte"/"lesão" recente num exercício
// do plano força o veredito negativo, independente do resto do score.
async function hasRecentSevereDiscomfort(userId, exerciseNames) {
  if (!exerciseNames.length) return false;
  const { data, error } = await db
    .from('exercise_discomfort')
    .select('id')
    .eq('user_id', userId)
    .in('exercise_name', exerciseNames)
    .in('severity', ['forte', 'lesao'])
    .gte('log_date', daysAgo(DISCOMFORT_LOOKBACK_DAYS))
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

async function adherenceRatio(userId, sinceDate, weeklyGoal) {
  const { data, error } = await db
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('workout_date', sinceDate);
  if (error) throw error;

  const weeksElapsed = Math.max(1, Math.round((parseLocalDate(todayDate()) - parseLocalDate(sinceDate)) / (7 * 86400000)));
  const expected = (weeklyGoal > 0 ? weeklyGoal : 5) * weeksElapsed;
  return expected > 0 ? (data || []).length / expected : 1;
}

// Avalia o ciclo do plano ativo que acabou de vencer: progressão/estagnação/
// regressão dos exercícios do plano, direção do peso vs objetivo, aderência
// aos treinos e desconforto/lesão recente. Retorna o veredito que decide qual
// sucessor ativar ('positivo'/'neutro' → next_plan_id, 'negativo' → regression_plan_id).
export async function evaluateCycleEvolution(userId, plan, days, meta = {}) {
  const sinceDate = plan.start_date || daysAgo(30);
  const exerciseNames = [...new Set(days.flatMap(d => [...d.exercicios, ...d.pos].map(e => e.nome)))];

  const trends = await Promise.all(exerciseNames.map(name => classifyExerciseTrend(userId, name, sinceDate)));
  const progressing = trends.filter(t => t === 'progrediu').length;
  const regressing = trends.filter(t => t === 'regrediu').length;
  const plateaued = trends.filter(t => t === 'estagnou').length;

  const wSignal = await weightSignal(userId, meta, sinceDate);
  const injuryOverride = await hasRecentSevereDiscomfort(userId, exerciseNames);
  const adherence = await adherenceRatio(userId, sinceDate, Number(meta.weeklyGoal));

  const score = (progressing - regressing - plateaued) + wSignal;

  let verdict;
  if (injuryOverride || adherence < MIN_ADHERENCE) verdict = 'negativo';
  else if (score > 0) verdict = 'positivo';
  else if (score < 0) verdict = 'negativo';
  else verdict = 'neutro';

  return { verdict, injuryOverride, progressing, regressing, plateaued, weightSignal: wSignal, adherence };
}
