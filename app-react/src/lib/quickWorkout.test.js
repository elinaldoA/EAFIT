import { describe, it, expect, beforeEach } from 'vitest';
import { treinoData, todayDate } from '../data/treinoData';
import {
  estimateMinutes, fitDayToTime, readQuickChoice, saveQuickChoice, applyQuickChoice,
} from './quickWorkout';

const segunda = treinoData.find(d => d.dia === 'Segunda');
const none = () => false;

describe('estimateMinutes', () => {
  it('estima o treino completo de segunda em mais de 45 min', () => {
    expect(estimateMinutes(segunda)).toBeGreaterThan(45);
  });

  it('bi-set leva menos tempo que os mesmos exercícios separados', () => {
    const day = { ...segunda, pos: [] };
    const grouped = { ...day, exercicios: day.exercicios.map((ex, i) => (i === 2 || i === 3 ? { ...ex, grupo: 'A' } : ex)) };
    expect(estimateMinutes(grouped)).toBeLessThan(estimateMinutes(day));
  });
});

describe('fitDayToTime', () => {
  it('tira primeiro o pós-treino', () => {
    const full = estimateMinutes(segunda);
    const { day, changes } = fitDayToTime(segunda, full - 5, none);
    expect(day.pos).toEqual([]);
    expect(changes[0]).toEqual({ type: 'pos', count: segunda.pos.length });
    expect(day.exercicios).toHaveLength(segunda.exercicios.length);
  });

  it('cabe em 30 min sem mexer nos dois principais', () => {
    const { day, minutes } = fitDayToTime(segunda, 30, none);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(day.exercicios[0]).toMatchObject({ nome: segunda.exercicios[0].nome, series: '4' });
    expect(day.exercicios[1]).toMatchObject({ nome: segunda.exercicios[1].nome, series: '3' });
  });

  it('em 20 min reduz os principais a 3 séries, mas nunca os tira', () => {
    const { day } = fitDayToTime(segunda, 20, none);
    expect(day.exercicios.slice(0, 2).map(e => e.nome)).toEqual(segunda.exercicios.slice(0, 2).map(e => e.nome));
    day.exercicios.slice(0, 2).forEach(e => expect(Number(e.series)).toBeGreaterThanOrEqual(3));
  });

  it('não corta série marcada nem tira exercício com série marcada', () => {
    const last = segunda.exercicios[segunda.exercicios.length - 1];
    const isDone = (nome, n) => nome === last.nome && n <= 3;
    const { day } = fitDayToTime(segunda, 20, isDone);
    expect(day.exercicios.find(e => e.nome === last.nome)?.series).toBe('3');
  });

  it('não altera o dia original', () => {
    const before = JSON.stringify(segunda);
    fitDayToTime(segunda, 20, none);
    expect(JSON.stringify(segunda)).toBe(before);
  });

  it('lista as mudanças para a tela', () => {
    const { changes } = fitDayToTime(segunda, 30, none);
    expect(changes.map(c => c.type)).toContain('pos');
    expect(changes.length).toBeGreaterThan(1);
  });
});

describe('escolha do dia', () => {
  beforeEach(() => localStorage.clear());

  it('vale só para hoje e para o mesmo dia do plano', () => {
    saveQuickChoice('Segunda', 30);
    expect(readQuickChoice('Segunda')).toBe(30);
    expect(readQuickChoice('Terça')).toBeNull();
    localStorage.setItem('quick_workout', JSON.stringify({ date: '2000-01-01', dia: 'Segunda', minutes: 30 }));
    expect(readQuickChoice('Segunda')).toBeNull();
  });

  it('ignora valor corrompido e tempo fora das opções', () => {
    localStorage.setItem('quick_workout', '{');
    expect(readQuickChoice('Segunda')).toBeNull();
    localStorage.setItem('quick_workout', JSON.stringify({ date: todayDate(), dia: 'Segunda', minutes: 7 }));
    expect(readQuickChoice('Segunda')).toBeNull();
  });

  it('applyQuickChoice devolve o dia do plano sem escolha', () => {
    expect(applyQuickChoice(segunda)).toBe(segunda);
    saveQuickChoice('Segunda', 20);
    expect(applyQuickChoice(segunda)).not.toBe(segunda);
    saveQuickChoice('Segunda', null);
    expect(applyQuickChoice(segunda)).toBe(segunda);
  });
});
