import { describe, it, expect, vi } from 'vitest';

// planEvolution.js importa lib/supabase.js (createClient() na hora do import
// falha sem VITE_SUPABASE_URL) e depende de records.js/weightLog.js pra
// histórico de séries e peso. Mocka os três pra isolar só a lógica de
// veredito (evaluateCycleEvolution), sem simular o client do Supabase inteiro.
const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn() } }));
vi.mock('./supabase', () => ({ db: mockDb }));
vi.mock('./records', () => ({ fetchExerciseSetsWithDates: vi.fn() }));
vi.mock('./weightLog', () => ({ fetchWeightLogs: vi.fn() }));

import { evaluateCycleEvolution } from './planEvolution';
import { fetchExerciseSetsWithDates } from './records';
import { fetchWeightLogs } from './weightLog';
import { todayDate } from '../data/treinoData';
import { parseLocalDate, toDateStr } from './utils';

function daysAgo(days) {
  const d = parseLocalDate(todayDate());
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}

const SINCE = daysAgo(21); // ciclo de 3 semanas, pra weeksElapsed=3 e expected=3*weeklyGoal

function chainResolving(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    not: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function mockDbFor({ discomfortRows = [], completedWorkouts = 20 } = {}) {
  mockDb.from.mockImplementation((table) => {
    if (table === 'exercise_discomfort') return chainResolving({ data: discomfortRows, error: null });
    if (table === 'workouts') {
      return chainResolving({ data: Array.from({ length: completedWorkouts }, (_, i) => ({ id: i })), error: null });
    }
    return chainResolving({ data: [], error: null });
  });
}

function trendSets(trend) {
  if (trend === 'progrediu') return [
    { carga: 50, reps: 8, workout_date: daysAgo(20) },
    { carga: 55, reps: 8, workout_date: daysAgo(2) },
  ];
  if (trend === 'regrediu') return [
    { carga: 55, reps: 8, workout_date: daysAgo(20) },
    { carga: 50, reps: 8, workout_date: daysAgo(2) },
  ];
  return []; // sem dado suficiente -> classificação null, não conta pro score
}

const oneExerciseDay = [{ exercicios: [{ nome: 'Supino Reto' }], pos: [] }];
const twoExerciseDays = [{ exercicios: [{ nome: 'Supino Reto' }, { nome: 'Agachamento' }], pos: [] }];

describe('evaluateCycleEvolution', () => {
  it('score positivo + peso a favor do objetivo -> veredito positivo', async () => {
    mockDbFor();
    fetchExerciseSetsWithDates.mockResolvedValue(trendSets('progrediu'));
    fetchWeightLogs.mockResolvedValue([{ log_date: daysAgo(20), peso: 80 }, { log_date: daysAgo(2), peso: 82 }]);

    const result = await evaluateCycleEvolution('u1', { start_date: SINCE }, oneExerciseDay, { meta: 'massa', weeklyGoal: 5 });

    expect(result.verdict).toBe('positivo');
    expect(result.injuryOverride).toBe(false);
  });

  it('exercício regrediu -> veredito negativo', async () => {
    mockDbFor();
    fetchExerciseSetsWithDates.mockResolvedValue(trendSets('regrediu'));
    fetchWeightLogs.mockResolvedValue([]);

    const result = await evaluateCycleEvolution('u1', { start_date: SINCE }, oneExerciseDay, { meta: 'saude', weeklyGoal: 5 });

    expect(result.verdict).toBe('negativo');
  });

  it('um exercício progride e outro regride, peso neutro -> veredito neutro', async () => {
    mockDbFor();
    fetchExerciseSetsWithDates.mockImplementation((_userId, exerciseName) =>
      Promise.resolve(exerciseName === 'Supino Reto' ? trendSets('progrediu') : trendSets('regrediu')));
    fetchWeightLogs.mockResolvedValue([]);

    const result = await evaluateCycleEvolution('u1', { start_date: SINCE }, twoExerciseDays, { meta: 'saude', weeklyGoal: 5 });

    expect(result.verdict).toBe('neutro');
  });

  it('desconforto forte/lesão recente força negativo mesmo com score positivo', async () => {
    mockDbFor({ discomfortRows: [{ id: 1 }] });
    fetchExerciseSetsWithDates.mockResolvedValue(trendSets('progrediu'));
    fetchWeightLogs.mockResolvedValue([{ log_date: daysAgo(20), peso: 80 }, { log_date: daysAgo(2), peso: 82 }]);

    const result = await evaluateCycleEvolution('u1', { start_date: SINCE }, oneExerciseDay, { meta: 'massa', weeklyGoal: 5 });

    expect(result.injuryOverride).toBe(true);
    expect(result.verdict).toBe('negativo');
  });

  it('aderência abaixo de 50% força negativo mesmo com score positivo', async () => {
    mockDbFor({ completedWorkouts: 1 }); // expected = 3 semanas * 5/semana = 15; 1/15 << 0.5
    fetchExerciseSetsWithDates.mockResolvedValue(trendSets('progrediu'));
    fetchWeightLogs.mockResolvedValue([{ log_date: daysAgo(20), peso: 80 }, { log_date: daysAgo(2), peso: 82 }]);

    const result = await evaluateCycleEvolution('u1', { start_date: SINCE }, oneExerciseDay, { meta: 'massa', weeklyGoal: 5 });

    expect(result.adherence).toBeLessThan(0.5);
    expect(result.verdict).toBe('negativo');
  });
});
