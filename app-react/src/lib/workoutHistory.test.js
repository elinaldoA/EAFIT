import { describe, it, expect, vi } from 'vitest';

// workoutHistory.js importa lib/supabase.js (createClient no import) — mesmo
// motivo do mock em records.test.js.
vi.mock('./supabase', () => ({ db: { from: vi.fn() } }));

import {
  monthRange, buildMonthGrid, buildSessions, summarizeMonth, previousBestByExercise, compareExercise,
} from './workoutHistory';

describe('monthRange', () => {
  it('cobre do dia 1 ao último dia do mês', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2024, 1)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange(2026, 11)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('buildMonthGrid', () => {
  it('começa na segunda e completa semanas de 7 dias', () => {
    // Setembro/2026 começa numa terça
    const weeks = buildMonthGrid(2026, 8);
    expect(weeks[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(weeks.every(w => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.at(-1).at(-1)).toBeNull();
  });

  it('mês que começa no domingo tem 6 células vazias antes', () => {
    // Fevereiro/2026 começa num domingo
    expect(buildMonthGrid(2026, 1)[0].filter(c => c === null)).toHaveLength(6);
  });
});

describe('buildSessions', () => {
  const workouts = [
    { id: 'a', workout_date: '2026-09-01', day_of_week: 'Terça', completed: true, duration_seconds: 3600, rating: 4, notes: 'ok' },
    { id: 'b', workout_date: '2026-09-02', day_of_week: 'Quarta', completed: false, duration_seconds: null },
    { id: 'c', workout_date: '2026-09-03', day_of_week: 'Quinta', completed: false, duration_seconds: null },
  ];
  const sets = [
    { workout_id: 'a', exercise_name: 'Supino', set_number: 2, carga: 60, reps: 8, completed: true },
    { workout_id: 'a', exercise_name: 'Supino', set_number: 1, carga: 60, reps: 10, completed: true },
    { workout_id: 'a', exercise_name: 'Remada', set_number: 1, carga: 50, reps: 10, completed: false },
    { workout_id: 'b', exercise_name: 'Agachamento', set_number: 1, carga: null, reps: null, completed: false },
    { workout_id: 'c', exercise_name: 'Rosca', set_number: 1, carga: 12, reps: 12, completed: true },
  ];

  it('descarta workouts sem atividade e ordena do mais recente pro mais antigo', () => {
    const sessions = buildSessions(workouts, sets);
    expect(sessions.map(s => s.id)).toEqual(['c', 'a']);
  });

  it('soma só séries concluídas e ordena as séries pelo número', () => {
    const a = buildSessions(workouts, sets).find(s => s.id === 'a');
    expect(a.doneSets).toBe(2);
    expect(a.totalCarga).toBe(120);
    expect(a.volume).toBe(60 * 10 + 60 * 8);
    const supino = a.exercises.find(e => e.nome === 'Supino');
    expect(supino.sets.map(s => s.n)).toEqual([1, 2]);
    expect(supino.best).toEqual({ carga: 60, reps: 10 });
    expect(a.exercises.find(e => e.nome === 'Remada').best).toBeNull();
  });

  it('resume o mês', () => {
    expect(summarizeMonth(buildSessions(workouts, sets))).toEqual({ treinos: 1, seconds: 3600, sets: 3, volume: 1080 + 144 });
  });
});

describe('previousBestByExercise', () => {
  it('pega a melhor série da sessão mais recente de cada exercício', () => {
    const map = previousBestByExercise([
      { exercise_name: 'Supino', carga: 70, reps: 6, workout_date: '2026-08-01' },
      { exercise_name: 'Supino', carga: 60, reps: 8, workout_date: '2026-08-20' },
      { exercise_name: 'Supino', carga: 62.5, reps: 6, workout_date: '2026-08-20' },
      { exercise_name: 'Supino', carga: 62.5, reps: 7, workout_date: '2026-08-20' },
      { exercise_name: 'Remada', carga: null, reps: 8, workout_date: '2026-08-21' },
    ]);
    expect(map.get('Supino')).toEqual({ date: '2026-08-20', carga: 62.5, reps: 7 });
    expect(map.has('Remada')).toBe(false);
  });
});

describe('compareExercise', () => {
  const previous = { date: '2026-08-20', carga: 60, reps: 8 };

  it('sobe por carga, ou por reps com a mesma carga', () => {
    expect(compareExercise({ carga: 62.5, reps: 6 }, previous)).toMatchObject({ trend: 'up', deltaCarga: 2.5 });
    expect(compareExercise({ carga: 60, reps: 9 }, previous)).toMatchObject({ trend: 'up', deltaCarga: 0, deltaReps: 1 });
  });

  it('desce, mantém, ou é novo', () => {
    expect(compareExercise({ carga: 55, reps: 12 }, previous).trend).toBe('down');
    expect(compareExercise({ carga: 60, reps: 8 }, previous).trend).toBe('same');
    expect(compareExercise({ carga: 60, reps: 8 }, undefined).trend).toBe('new');
    expect(compareExercise(null, previous).trend).toBe('none');
  });
});
