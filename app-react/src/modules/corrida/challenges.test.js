import { describe, it, expect } from 'vitest';
import { monthMedals, newMedals, lastWeekSummary, monthlyChallenges, challengeProgress } from './challenges';

const run = (date, km) => ({ run_date: date, distance_m: km * 1000 });

describe('monthlyChallenges', () => {
  it('soma só o mês de hoje e sobe de nível', () => {
    const runs = [run('2026-11-02', 10), run('2026-11-04', 16), run('2026-10-30', 30)];
    const byKind = Object.fromEntries(monthlyChallenges(runs, '2026-11-05').map(c => [c.kind, c]));
    expect(byKind.km).toMatchObject({ value: 26, tierDone: 1, goal: 50, done: false });
    expect(byKind.runs).toMatchObject({ value: 2, goal: 4 });
    expect(byKind.long).toMatchObject({ value: 16, tierDone: 3, goal: 21.1 });
    expect(byKind.week).toMatchObject({ value: 2, goal: 3 });
  });

  it('marca concluído no último nível e a barra fica entre 0 e 1', () => {
    const runs = Array.from({ length: 3 }, (_, i) => run(`2026-11-0${i + 3}`, 5));
    const week = monthlyChallenges(runs, '2026-11-05').find(c => c.kind === 'week');
    expect(week.done).toBe(true);
    expect(challengeProgress(week)).toBe(1);
    expect(challengeProgress({ value: 0, goal: 0 })).toBe(0);
  });
});

describe('medalhas', () => {
  const runs = [
    { run_date: '2026-10-03', distance_m: 10500, duration_s: 3600 },
    { run_date: '2026-10-10', distance_m: 9000, duration_s: 3000 },
    { run_date: '2026-10-17', distance_m: 8000, duration_s: 2800 },
    { run_date: '2026-11-02', distance_m: 5200, duration_s: 1800 },
  ];

  it('cada nível batido no mês vira medalha, do mês mais recente ao mais antigo', () => {
    const m = monthMedals(runs, '2026-11-06');
    expect(m.map(x => `${x.month} ${x.kind} ${x.goal}`)).toEqual([
      '2026-11 long 5',
      '2026-10 km 25', '2026-10 long 5', '2026-10 long 10',
    ]);
  });

  it('a corrida nova mostra só a medalha que acabou de ganhar', () => {
    const before = runs.slice(0, 3);
    const got = newMedals(before, runs, '2026-11-06');
    expect(got.map(x => `${x.month} ${x.kind} ${x.goal}`)).toEqual(['2026-11 long 5']);
    expect(newMedals(runs, runs, '2026-11-06')).toEqual([]);
  });
});

describe('resumo da semana passada', () => {
  it('soma a semana passada e compara com a anterior', () => {
    const runs = [
      { run_date: '2026-10-27', distance_m: 5000, duration_s: 1500 },
      { run_date: '2026-11-01', distance_m: 7000, duration_s: 2400 },
      { run_date: '2026-10-21', distance_m: 10000, duration_s: 3300 },
      { run_date: '2026-11-03', distance_m: 4000, duration_s: 1300 },
    ];
    expect(lastWeekSummary(runs, '2026-11-06')).toEqual({ start: '2026-10-26', meters: 12000, runs: 2, seconds: 3900, prevMeters: 10000, change: 20 });
    expect(lastWeekSummary([], '2026-11-06')).toMatchObject({ runs: 0, change: null });
  });
});
