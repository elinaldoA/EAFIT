import { describe, it, expect } from 'vitest';
import en from '../i18n/en';
import { FOOD_DATABASE, ALL_FOODS, searchFoods, portionOf, fromTaco } from './foodDatabase';
import { TACO_FOODS } from './tacoFoods';
import { measuresFor } from './householdMeasures';

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
    expect(frango).toMatchObject({ kcal: 159, g: 32, carbs: 0, fat: 2.5, fiber: 0 });
    expect(TACO_FOODS.find(f => f.name === 'Feijão, carioca, cozido')).toMatchObject({ fiber: 8.5, sodium: 2 });
    for (const f of TACO_FOODS) {
      expect(f.fiber, f.name).toBeGreaterThanOrEqual(0);
      expect(f.sodium, f.name).toBeGreaterThanOrEqual(0);
    }
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

  it('portionOf calcula pelos gramas, com fibra e sódio quando o alimento tem', () => {
    const arroz = FOOD_DATABASE.find(f => f.name === 'Arroz branco cozido');
    expect(portionOf(arroz, 200)).toEqual({ g: 5, kcal: 256, carbs: 56, fat: 0, fiber: 3.2, sodium: 2 });
    expect(portionOf(arroz, 0)).toEqual({ g: 0, kcal: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 });
    expect(portionOf({ g: 10, kcal: 100, carbs: 0, fat: 0 }, 50)).toEqual({ g: 5, kcal: 50, carbs: 0, fat: 0 });
  });

  it('itens próprios ligados à TACO usam os valores da tabela', () => {
    const byName = n => FOOD_DATABASE.find(f => f.name === n);
    expect(byName('Abacate')).toMatchObject(fromTaco('Abacate, cru'));
    expect(byName('Peito de frango grelhado')).toMatchObject({ kcal: 159, g: 32, fat: 2.5 });
    expect(byName('Brócolis cozido')).toMatchObject({ kcal: 25, carbs: 4.4 });
    expect(() => fromTaco('Não existe')).toThrow();
    for (const f of FOOD_DATABASE) {
      expect(Number.isFinite(f.fiber), f.name).toBe(true);
      expect(Number.isFinite(f.sodium), f.name).toBe(true);
    }
  });

  it('prato montado soma os ingredientes por 100 g', () => {
    const pf = FOOD_DATABASE.find(f => f.name === 'Prato feito (arroz, feijão, carne e salada)');
    // 150 g arroz + 100 feijão + 100 carne moída + 30 alface + 30 tomate = 410 g.
    const kcal = (128 * 1.5 + 76 + 212 + 11 * 0.3 + 15 * 0.3) / 4.1;
    expect(pf.kcal).toBe(Math.round(kcal));
    expect(pf.portion).toBe(410);
  });
});

describe('householdMeasures', () => {
  it('acha medidas pelo nome, também nos itens da TACO', () => {
    expect(measuresFor('Arroz branco cozido').map(m => m.grams)).toEqual([25, 45, 90]);
    expect(measuresFor('Arroz, tipo 1, cozido')).toHaveLength(3);
    expect(measuresFor('Feijão, carioca, cozido')).toContainEqual({ label: 'concha média', grams: 140 });
    expect(measuresFor('Laranja, pêra, suco')).toEqual([{ label: 'copo', grams: 200 }]);
    expect(measuresFor('Laranja')).toEqual([{ label: 'unidade média', grams: 140 }]);
    expect(measuresFor('Pastel de carne frito')).toEqual([{ label: 'unidade', grams: 80 }]);
  });

  it('não confunde alimentos parecidos e sem regra fica só em gramas', () => {
    expect(measuresFor('Melão, cru')).toEqual([]);
    expect(measuresFor('Leite, de vaca, integral, pó')).toEqual([]);
    expect(measuresFor('Café, pó, torrado')).toEqual([]);
    expect(measuresFor('Batata, inglesa, frita')).toEqual([]);
    expect(measuresFor('')).toEqual([]);
  });

  it('itens próprios guardam o nome em português (ptName)', () => {
    for (const f of FOOD_DATABASE) expect(f.ptName, f.name).toBeTruthy();
  });
});
