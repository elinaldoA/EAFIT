import { describe, it, expect } from 'vitest';
import { isTimedItem, parsePlannedSeconds, toSeconds, formatSeconds } from './timedSets';

describe('isTimedItem', () => {
  it('reconhece reps em segundos', () => {
    expect(isTimedItem({ series: '3', reps: '40s' })).toBe(true);
    expect(isTimedItem({ series: '3', reps: '30s cada lado' })).toBe(true);
    expect(isTimedItem({ series: '3', reps: '20-30s' })).toBe(true);
    expect(isTimedItem({ series: '3', reps: '45 seg' })).toBe(true);
  });

  it('não pega repetições, cardio nem itens sem séries', () => {
    expect(isTimedItem({ series: '3', reps: '8-10' })).toBe(false);
    expect(isTimedItem({ series: '3', reps: '12 cada' })).toBe(false);
    expect(isTimedItem({ series: '-', reps: '20min · Moderado' })).toBe(false);
    expect(isTimedItem({ series: '-', reps: '30s' })).toBe(false);
    expect(isTimedItem(null)).toBe(false);
  });
});

describe('parsePlannedSeconds', () => {
  it('usa o teto da faixa', () => {
    expect(parsePlannedSeconds('40s')).toBe(40);
    expect(parsePlannedSeconds('20-30s')).toBe(30);
    expect(parsePlannedSeconds('8-10')).toBeNull();
  });
});

describe('toSeconds / formatSeconds', () => {
  it('valida e arredonda', () => {
    expect(toSeconds('42,6')).toBe(43);
    expect(toSeconds('')).toBeNull();
    expect(toSeconds('-3')).toBeNull();
    expect(toSeconds('4000')).toBeNull();
  });

  it('formata segundos e minutos', () => {
    expect(formatSeconds(40)).toBe('40s');
    expect(formatSeconds(65)).toBe('1:05');
    expect(formatSeconds(null)).toBe('');
  });
});
