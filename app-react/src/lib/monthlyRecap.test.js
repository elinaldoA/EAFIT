import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { monthBounds, longestStreak, buildMonthlyRecap, formatMinutes, pctChange } from './monthlyRecap';

describe('monthBounds', () => {
  it('este mês e o anterior, incluindo virada de ano', () => {
    expect(monthBounds('2026-10-15', 0)).toEqual({ start: '2026-10-01', end: '2026-10-31', label: 'outubro de 2026' });
    expect(monthBounds('2026-01-10', -1)).toEqual({ start: '2025-12-01', end: '2025-12-31', label: 'dezembro de 2025' });
    expect(monthBounds('2026-03-05', -1).end).toBe('2026-02-28');
  });
});

describe('longestStreak', () => {
  it('maior sequência de dias seguidos, ignorando repetidos e ordem', () => {
    expect(longestStreak(['2026-10-03', '2026-10-01', '2026-10-02', '2026-10-02', '2026-10-10', '2026-10-11'])).toBe(3);
    expect(longestStreak(['2026-10-31', '2026-11-01'])).toBe(2);
    expect(longestStreak([])).toBe(0);
  });
});

describe('pctChange', () => {
  it('null sem base; senão percentual arredondado', () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(15, 10)).toBe(50);
    expect(pctChange(5, 10)).toBe(-50);
  });
});

describe('formatMinutes', () => {
  it('formata minutos e horas', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(135)).toBe('2h 15min');
  });
});

describe('buildMonthlyRecap', () => {
  const today = '2026-10-20';
  const w = (workout_date, completed = true, duration_seconds = 3600) => ({ workout_date, completed, duration_seconds });
  const workouts = [
    w('2026-09-10'), w('2026-09-12'),                       // mês anterior: 2
    w('2026-10-05'), w('2026-10-06'), w('2026-10-07'),      // sequência de 3 (seg, ter, qua)
    w('2026-10-14', false),                                 // não concluído: ignorado
    w('2026-10-19', true, 1800),
  ];
  const logs = [
    { exercise_name: 'Supino', carga: '40', reps: '10', workout_date: '2026-09-10' },
    { exercise_name: 'Supino', carga: '50', reps: '8', workout_date: '2026-10-05' },   // recorde (50 > 40)
    { exercise_name: 'Agachamento', carga: '60', reps: '10', workout_date: '2026-10-06' }, // primeiro registro: não é recorde
    { exercise_name: 'Remada', carga: '30', reps: '10', workout_date: '2026-09-12' },
    { exercise_name: 'Remada', carga: '30', reps: '12', workout_date: '2026-10-07' },     // igual: não é recorde
    { exercise_name: 'Rosca', carga: 'x', reps: '10', workout_date: '2026-10-07' },       // inválido: ignorado
  ];

  it('conta treinos, comparação, sequência, tempo e dia favorito', () => {
    const r = buildMonthlyRecap({ workouts, allTimeLogs: logs, today });
    expect(r).toMatchObject({
      label: 'outubro de 2026', treinos: 4, treinosPrev: 2, deltaPct: 100, activeDays: 4,
      minutes: 3 * 60 + 30, bestStreak: 3,
    });
  });

  it('volume soma carga × reps só do mês e recorde só quando supera o histórico', () => {
    const r = buildMonthlyRecap({ workouts, allTimeLogs: logs, today });
    expect(r.volume).toBe(50 * 8 + 60 * 10 + 30 * 12);
    expect(r.prCount).toBe(1);
  });

  it('mês passado usa as mesmas regras com offset -1', () => {
    const r = buildMonthlyRecap({ workouts, allTimeLogs: logs, today, offset: -1 });
    expect(r).toMatchObject({ label: 'setembro de 2026', treinos: 2, treinosPrev: 0, deltaPct: null, prCount: 0 });
  });

  it('sem dados devolve zeros e sem dia favorito', () => {
    const r = buildMonthlyRecap({ workouts: [], allTimeLogs: [], today });
    expect(r).toMatchObject({ treinos: 0, volume: 0, prCount: 0, bestStreak: 0, favWeekday: null });
  });

  it('dia favorito é o dia da semana mais frequente', () => {
    const r = buildMonthlyRecap({ workouts: [w('2026-10-05'), w('2026-10-12'), w('2026-10-06')], allTimeLogs: [], today });
    expect(r.favWeekday).toBe('segunda');
  });
});
