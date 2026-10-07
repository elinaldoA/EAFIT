import { describe, it, expect, beforeEach } from 'vitest';
import { gatherExerciseDetails, countSets } from './workoutSets';

beforeEach(() => localStorage.clear());

describe('gatherExerciseDetails com cardio', () => {
  it('conta o cardio como 1 registro com duração e distância', () => {
    const nome = '🏃 Cardio — Esteira';
    localStorage.setItem(`set_${nome}_1_done`, 'true');
    localStorage.setItem(`set_${nome}_1_duracao`, '30');
    localStorage.setItem(`set_${nome}_1_distancia`, '5');
    const day = { exercicios: [{ nome: 'Supino', series: '3' }], pos: [{ nome, series: '-', reps: '20min' }] };
    const exs = gatherExerciseDetails(day);
    expect(countSets(exs)).toEqual({ done: 1, total: 4 });
    const cardio = exs.find(e => e.nome === nome);
    expect(cardio.cardio).toBe(true);
    expect(cardio.sets[0]).toMatchObject({ done: true, duracao: '30', distancia: '5' });
  });
});
