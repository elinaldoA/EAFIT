import { describe, it, expect } from 'vitest';
import { MILESTONES, goalProgress } from './programGoals';

describe('goalProgress', () => {
  it('sem cadastros: primeira meta é 1', () => {
    expect(goalProgress(0)).toEqual({ reached: [], next: 1, prev: 0, pct: 0, missing: 1 });
  });

  it('entre marcos: progresso a partir do último batido', () => {
    expect(goalProgress(7)).toEqual({ reached: [1, 5], next: 10, prev: 5, pct: 40, missing: 3 });
  });

  it('no marco exato ele conta como batido', () => {
    expect(goalProgress(10).reached).toEqual([1, 5, 10]);
    expect(goalProgress(10).next).toBe(25);
    expect(goalProgress(10).pct).toBe(0);
  });

  it('depois do último marco fica completo', () => {
    expect(goalProgress(1500)).toMatchObject({ reached: MILESTONES, next: null, pct: 100, missing: 0 });
  });

  it('valor inválido vale zero', () => {
    expect(goalProgress(undefined).next).toBe(1);
    expect(goalProgress(-3).reached).toEqual([]);
  });
});
