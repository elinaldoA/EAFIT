import { describe, it, expect } from 'vitest';
import { buildFunnel, pivotRetention } from './activation';

describe('buildFunnel', () => {
  it('calcula % do total e da etapa anterior e aponta a maior perda', () => {
    const { steps, worstKey } = buildFunnel({
      signed_up: 100, confirmed: 80, onboarded: 72, first_workout: 30, second_workout_7d: 18,
    });
    expect(steps.map(s => s.pctOfStart)).toEqual([100, 80, 72, 30, 18]);
    expect(steps.map(s => s.pctOfPrev)).toEqual([null, 80, 90, 42, 60]);
    expect(worstKey).toBe('first_workout');
  });

  it('aceita contagens como string (bigint do Postgres vem assim)', () => {
    const { steps } = buildFunnel({ signed_up: '4', confirmed: '2', onboarded: '2', first_workout: '1', second_workout_7d: '0' });
    expect(steps.map(s => s.count)).toEqual([4, 2, 2, 1, 0]);
  });

  it('funil vazio não tem % nem pior etapa', () => {
    const { steps, worstKey } = buildFunnel({ signed_up: 0, confirmed: 0, onboarded: 0, first_workout: 0, second_workout_7d: 0 });
    expect(steps.every(s => s.pctOfStart === null)).toBe(true);
    expect(worstKey).toBeNull();
  });
});

describe('pivotRetention', () => {
  const rows = [
    { cohort_week: '2026-09-07', cohort_size: 4, week_index: 0, active_users: 3, complete: true },
    { cohort_week: '2026-09-07', cohort_size: 4, week_index: 1, active_users: 2, complete: true },
    { cohort_week: '2026-09-07', cohort_size: 4, week_index: 2, active_users: 1, complete: false },
    { cohort_week: '2026-09-14', cohort_size: 6, week_index: 0, active_users: 3, complete: true },
    { cohort_week: '2026-09-14', cohort_size: 6, week_index: 1, active_users: 1, complete: false },
  ];

  it('ordena da coorte mais nova pra mais antiga e preenche semanas futuras com null', () => {
    const { weekIndexes, cohorts } = pivotRetention(rows);
    expect(weekIndexes).toEqual([0, 1, 2]);
    expect(cohorts.map(c => c.week)).toEqual(['2026-09-14', '2026-09-07']);
    expect(cohorts[0].cells[2]).toBeNull();
    expect(cohorts[1].cells[0]).toEqual({ active: 3, complete: true, pct: 75 });
  });

  it('média ponderada só com células completas', () => {
    const { average } = pivotRetention(rows);
    expect(average[0]).toBe(60); // (3 + 3) / (4 + 6)
    expect(average[1]).toBe(50); // só a coorte de 07/09 está completa: 2 / 4
    expect(average[2]).toBeNull();
  });

  it('sem linhas, tabela vazia', () => {
    expect(pivotRetention([])).toEqual({ weekIndexes: [], cohorts: [], average: [] });
  });
});
