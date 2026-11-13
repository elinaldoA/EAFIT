import { describe, it, expect } from 'vitest';
import { pickFirstWorkoutDay } from './firstWorkout';

const day = (dia, work = true) => ({ dia, work });
const hasWork = d => d.work;
const plan = [day('Segunda'), day('Terça', false), day('Quarta'), day('Sexta')];

describe('pickFirstWorkoutDay', () => {
  it('hoje, quando tem treino', () => {
    expect(pickFirstWorkoutDay(plan, 'Quarta', hasWork).dia).toBe('Quarta');
  });
  it('dia de descanso: o próximo dia com treino', () => {
    expect(pickFirstWorkoutDay(plan, 'Terça', hasWork).dia).toBe('Quarta');
    expect(pickFirstWorkoutDay(plan, 'Quinta', hasWork).dia).toBe('Sexta');
  });
  it('depois do último dia: volta para o primeiro da semana', () => {
    expect(pickFirstWorkoutDay(plan, 'Sábado', hasWork).dia).toBe('Segunda');
    expect(pickFirstWorkoutDay(plan, 'Domingo', hasWork).dia).toBe('Segunda');
  });
  it('sem nenhum dia com treino, ou sem plano: null', () => {
    expect(pickFirstWorkoutDay([day('Segunda', false)], 'Segunda', hasWork)).toBeNull();
    expect(pickFirstWorkoutDay(null, 'Segunda', hasWork)).toBeNull();
  });
});
