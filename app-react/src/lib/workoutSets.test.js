import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gatherExerciseDetails, countSets } from './workoutSets';

beforeEach(() => localStorage.clear());

describe('gatherExerciseDetails com cardio', () => {
  it('conta o cardio como 1 registro com duração e distância', () => {
    const nome = '🏃 Cardio — Esteira';
    localStorage.setItem(`set_Segunda_${nome}_1_done`, 'true');
    localStorage.setItem(`set_Segunda_${nome}_1_duracao`, '30');
    localStorage.setItem(`set_Segunda_${nome}_1_distancia`, '5');
    const day = { dia: 'Segunda', exercicios: [{ nome: 'Supino', series: '3' }], pos: [{ nome, series: '-', reps: '20min' }] };
    const exs = gatherExerciseDetails(day);
    expect(countSets(exs)).toEqual({ done: 1, total: 4 });
    const cardio = exs.find(e => e.nome === nome);
    expect(cardio.cardio).toBe(true);
    expect(cardio.sets[0]).toMatchObject({ done: true, duracao: '30', distancia: '5' });
  });
});

import { clearDayLocal } from './workoutSets';
import { getDateForWeekday } from './utils';

describe('chave de série por dia', () => {
  it('o mesmo exercício em dois dias não divide as séries', () => {
    localStorage.clear();
    const ex = { nome: 'Supino', series: '2' };
    localStorage.setItem('set_Segunda_Supino_1_done', 'true');
    const seg = countSets(gatherExerciseDetails({ dia: 'Segunda', exercicios: [ex], pos: [] }));
    const qui = countSets(gatherExerciseDetails({ dia: 'Quinta', exercicios: [ex], pos: [] }));
    expect(seg).toEqual({ done: 1, total: 2 });
    expect(qui).toEqual({ done: 0, total: 2 });
  });
});

describe('clearDayLocal', () => {
  it('apaga séries, notas e cronômetro do dia e preserva o resto', () => {
    localStorage.clear();
    localStorage.setItem('set_Segunda_Supino_1_done', 'true');
    localStorage.setItem('set_Segunda_Supino_1_carga', '60');
    localStorage.setItem('set_Terça_Agacha_1_done', 'true');
    localStorage.setItem('treino_Segunda_timer', '{}');
    localStorage.setItem('treino_Segunda_notes', 'x');
    localStorage.setItem('treino_Terça_timer', '{}');
    clearDayLocal({ dia: 'Segunda', exercicios: [{ nome: 'Supino' }], pos: [] });
    expect(localStorage.getItem('set_Segunda_Supino_1_done')).toBeNull();
    expect(localStorage.getItem('treino_Segunda_timer')).toBeNull();
    expect(localStorage.getItem('treino_Segunda_notes')).toBeNull();
    expect(localStorage.getItem('set_Terça_Agacha_1_done')).toBe('true');
    expect(localStorage.getItem('treino_Terça_timer')).toBe('{}');
  });

  it('mantém o cronômetro quando pedido', () => {
    localStorage.clear();
    localStorage.setItem('treino_Segunda_timer', '{"status":"running"}');
    clearDayLocal({ dia: 'Segunda', exercicios: [], pos: [] }, { keepTimer: true });
    expect(localStorage.getItem('treino_Segunda_timer')).toBe('{"status":"running"}');
  });
});

describe('semana de segunda a domingo', () => {
  afterEach(() => vi.useRealTimers());
  it('no domingo, segunda é a de seis dias atrás', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T15:00:00-03:00')); // domingo
    expect(getDateForWeekday('Segunda')).toBe('2026-11-16');
    expect(getDateForWeekday('Domingo')).toBe('2026-11-22');
  });
  it('na segunda, domingo é o do fim da semana', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T15:00:00-03:00')); // segunda
    expect(getDateForWeekday('Segunda')).toBe('2026-11-23');
    expect(getDateForWeekday('Domingo')).toBe('2026-11-29');
  });
});
