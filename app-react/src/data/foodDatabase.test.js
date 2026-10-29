import { describe, it, expect } from 'vitest';
import en from '../i18n/en';
import { FOOD_DATABASE, ALL_FOODS, searchFoods, portionOf } from './foodDatabase';
import { TACO_FOODS } from './tacoFoods';

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
    expect(new Set(ALL_FOODS.map(f => f.id)).size).toBe(ALL_FOODS.length);
  });

  it('TACO tem os ~590 alimentos com valores válidos', () => {
    expect(TACO_FOODS.length).toBeGreaterThan(580);
    for (const f of TACO_FOODS) {
      expect(f.name, f.id).toBeTruthy();
      expect(f.icon, f.name).toBeTruthy();
      expect(f.portion, f.name).toBeGreaterThan(0);
      for (const k of ['kcal', 'g', 'carbs', 'fat']) {
        expect(f[k], `${f.name} ${k}`).toBeGreaterThanOrEqual(0);
        expect(f[k], `${f.name} ${k}`).toBeLessThanOrEqual(900);
      }
    }
    const frango = TACO_FOODS.find(f => f.name === 'Frango, peito, sem pele, grelhado');
    expect(frango).toMatchObject({ kcal: 159, g: 32, carbs: 0, fat: 2.5 });
  });

  it('busca acha alimentos da TACO e põe os itens próprios e quem começa pela palavra na frente', () => {
    expect(searchFoods('cuscuz')[0].name).toBe('Cuscuz de milho');
    expect(searchFoods('cuscuz').some(f => f.source === 'taco')).toBe(true);
    expect(searchFoods('acai').map(f => f.name)).toContain('Açaí, polpa, congelada');
    const feijao = searchFoods('feijao', TACO_FOODS, 50);
    const firstOther = feijao.findIndex(f => !/^feij/i.test(f.name));
    expect(feijao.slice(firstOther).every(f => !/^feij/i.test(f.name))).toBe(true);
    expect(searchFoods('arroz')).toHaveLength(10);
    expect(searchFoods('feijao carioca', TACO_FOODS).map(f => f.name)).toEqual(['Feijão, carioca, cozido', 'Feijão, carioca, cru']);
    expect(searchFoods('feijao carioca cru', TACO_FOODS)[0].name).toBe('Feijão, carioca, cru');
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
