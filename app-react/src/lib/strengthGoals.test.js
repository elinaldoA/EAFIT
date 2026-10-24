import { describe, it, expect } from 'vitest';
import { readGoals, goalFor, newGoal, suggestTarget, sessionBests, projectGoal } from './strengthGoals';
import { addDays } from './pause';

const TODAY = '2026-10-24';
const goal = { id: 'g1', exercise: 'Supino Reto com Barra', target: 100, by: '2026-12-19', created: '2026-09-01' };

// Uma sessão por semana subindo `step` kg de 1RM estimado (reps 1 = carga).
function weekly(startKg, step, weeks, lastDate = TODAY) {
  return Array.from({ length: weeks }, (_, i) => ({
    date: addDays(lastDate, -(weeks - 1 - i) * 7), e1rm: startKg + i * step, carga: startKg + i * step,
  }));
}

describe('readGoals', () => {
  it('descarta o que vier torto do metadata', () => {
    const user = { user_metadata: { strengthGoals: [goal, { exercise: 'X', target: -1, by: '2026-12-01', id: 'x' }, null, { ...goal, id: 'g2', by: 'amanhã' }] } };
    expect(readGoals(user)).toEqual([goal]);
    expect(readGoals({ user_metadata: {} })).toEqual([]);
  });

  it('goalFor ignora metas já batidas', () => {
    const user = { user_metadata: { strengthGoals: [{ ...goal, achieved: '2026-10-01' }] } };
    expect(goalFor(user, goal.exercise)).toBeNull();
  });

  it('newGoal e sugestão de alvo', () => {
    const g = newGoal('Agachamento Livre', '120', '2027-01-30', TODAY);
    expect(g).toMatchObject({ exercise: 'Agachamento Livre', target: 120, by: '2027-01-30', created: TODAY });
    expect(g.id).toBeTruthy();
    expect(suggestTarget(91)).toBe(102.5);
    expect(suggestTarget(0)).toBe('');
  });
});

describe('sessionBests', () => {
  it('melhor 1RM estimado e maior carga de cada dia', () => {
    const s = sessionBests([
      { carga: 80, reps: 10, workout_date: '2026-10-01' },
      { carga: 90, reps: 3, workout_date: '2026-10-01' },
      { carga: 85, reps: 5, workout_date: '2026-10-08' },
    ]);
    expect(s).toHaveLength(2);
    expect(s[0].carga).toBe(90);
    expect(s[0].e1rm).toBeCloseTo(106.67, 1);
  });
});

describe('projectGoal', () => {
  it('no ritmo quando a reta chega antes do prazo', () => {
    const p = projectGoal(goal, weekly(80, 2.5, 6), TODAY);
    expect(p.status).toBe('on_track');
    expect(p.perWeek).toBeCloseTo(2.5, 1);
    expect(p.eta <= goal.by).toBe(true);
  });

  it('atrasado quando o ritmo não basta', () => {
    const p = projectGoal(goal, weekly(80, 0.5, 6), TODAY);
    expect(p.status).toBe('behind');
    expect(p.needPerWeek).toBeGreaterThan(p.perWeek);
  });

  it('parado quando a carga não sobe', () => {
    expect(projectGoal(goal, weekly(85, 0, 6), TODAY).status).toBe('stalled');
  });

  it('sem dados suficientes', () => {
    expect(projectGoal(goal, weekly(85, 1, 2), TODAY).status).toBe('no_data');
    expect(projectGoal(goal, [], TODAY).status).toBe('no_data');
  });

  it('batida só com a carga de verdade', () => {
    const sessions = [...weekly(90, 1, 4), { date: TODAY, e1rm: 110, carga: 95 }];
    expect(projectGoal(goal, sessions, TODAY).status).not.toBe('achieved');
    expect(projectGoal(goal, [...weekly(90, 1, 4), { date: TODAY, e1rm: 100, carga: 100 }], TODAY).status).toBe('achieved');
  });

  it('vencida depois do prazo', () => {
    expect(projectGoal(goal, weekly(80, 1, 6), '2027-01-10').status).toBe('expired');
  });

  it('progresso do ponto de partida ao alvo', () => {
    const sessions = [{ date: '2026-08-25', e1rm: 80, carga: 80 }, { date: '2026-10-20', e1rm: 90, carga: 90 }];
    expect(projectGoal(goal, sessions, TODAY).pct).toBe(50);
  });
});
