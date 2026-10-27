import { describe, it, expect } from 'vitest';
import { applyFood, normalizeTotals, pctOfGoal, EMPTY_TOTALS } from './nutritionTotals';

const frango = { g: 31, kcal: 165, carbs: 0, fat: 4 };

describe('applyFood', () => {
  it('soma todos os macros do alimento', () => {
    expect(applyFood(EMPTY_TOTALS, frango)).toEqual({ protein: 31, kcal: 165, carbs: 0, fat: 4 });
  });
  it('subtrai sem ficar negativo', () => {
    expect(applyFood({ protein: 10, kcal: 100, carbs: 0, fat: 0 }, frango, -1)).toEqual({ protein: 0, kcal: 0, carbs: 0, fat: 0 });
  });
  it('aceita totais ausentes e valores inválidos', () => {
    expect(applyFood(null, { g: 'x', kcal: 50 })).toEqual({ protein: 0, kcal: 50, carbs: 0, fat: 0 });
  });
});

describe('normalizeTotals', () => {
  it('troca ausentes e inválidos por 0', () => {
    expect(normalizeTotals({ protein: '12', kcal: -5 })).toEqual({ protein: 12, kcal: 0, carbs: 0, fat: 0 });
    expect(normalizeTotals(null)).toEqual(EMPTY_TOTALS);
  });
});

describe('pctOfGoal', () => {
  it('limita em 100 e trata meta zero', () => {
    expect(pctOfGoal(50, 100)).toBe(50);
    expect(pctOfGoal(300, 100)).toBe(100);
    expect(pctOfGoal(10, 0)).toBe(0);
  });
});
