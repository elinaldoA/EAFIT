import { describe, it, expect } from 'vitest';
import en from '../i18n/en';
import { FOOD_DATABASE, searchFoods, portionOf } from './foodDatabase';

describe('foodDatabase', () => {
  it('todo alimento tem tradução em inglês e macros coerentes', () => {
    for (const f of FOOD_DATABASE) {
      expect(en[f.name], f.name).toBeTruthy();
      expect(f.kcal).toBeGreaterThanOrEqual(0);
      // Calorias de 100 g não passam de ~900 e batem grosseiramente com os macros (4/4/9).
      const est = f.g * 4 + f.carbs * 4 + f.fat * 9;
      expect(Math.abs(est - f.kcal), f.name).toBeLessThan(Math.max(40, f.kcal * 0.35));
    }
  });

  it('ids são únicos', () => {
    expect(new Set(FOOD_DATABASE.map(f => f.id)).size).toBe(FOOD_DATABASE.length);
  });

  it('busca ignora acento e caixa e exige todas as palavras', () => {
    expect(searchFoods('ARROZ branco').map(f => f.name)).toContain('Arroz branco cozido');
    expect(searchFoods('maca').map(f => f.name)).toContain('Maçã');
    expect(searchFoods('arroz xyz')).toEqual([]);
    expect(searchFoods('   ')).toEqual([]);
  });

  it('portionOf calcula pelos gramas', () => {
    const arroz = FOOD_DATABASE.find(f => f.name === 'Arroz branco cozido');
    expect(portionOf(arroz, 200)).toEqual({ g: 5, kcal: 260, carbs: 56, fat: 0 });
    expect(portionOf(arroz, 0)).toEqual({ g: 0, kcal: 0, carbs: 0, fat: 0 });
  });
});
