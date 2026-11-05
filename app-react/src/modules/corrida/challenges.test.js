import { describe, it, expect } from 'vitest';
import { monthlyChallenges, challengeProgress } from './challenges';

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
