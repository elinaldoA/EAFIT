import { describe, it, expect } from 'vitest';
import { mealTarget, fitMeal, suggestGoalMeals, trainingWindow, goalFocus, __TEMPLATES } from './goalMeals';
import { FOOD_DATABASE } from '../data/foodDatabase';

const goalsCut = { kcal: 1800, protein: 160 };
const goalsBulk = { kcal: 3200, protein: 150 };
const zero = { kcal: 0, protein: 0 };

describe('modelos de refeição', () => {
  it('todo alimento dos modelos existe na base', () => {
    const names = new Set(FOOD_DATABASE.map(f => f.ptName));
    const missing = __TEMPLATES.flatMap(tp => tp.items.map(([n]) => n)).filter(n => !names.has(n));
    expect(missing).toEqual([]);
  });

  it('cada meta tem ao menos uma opção em cada refeição principal', () => {
    for (const meta of ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia']) {
      for (const meal of ['cafe', 'almoco', 'lanche', 'jantar']) {
        expect(__TEMPLATES.some(tp => tp.meal === meal && tp.metas.includes(meta)), `${meta}/${meal}`).toBe(true);
      }
    }
  });
});

describe('mealTarget', () => {
  it('divide o que falta entre esta refeição e as próximas, no peso da meta', () => {
    const t = mealTarget({ goals: goalsCut, totals: { kcal: 450, protein: 40 }, meal: 'almoco', meta: 'emagrecer' });
    // almoço 0,38 de (0,38 + 0,12 + 0,25 + 0) do que falta
    expect(t.kcal).toBe(Math.round((1350 * 0.38) / 0.75 / 10) * 10);
    expect(t.tight).toBe(false);
  });

  it('refeições puladas não viram uma refeição gigante', () => {
    const t = mealTarget({ goals: goalsBulk, totals: zero, meal: 'jantar', meta: 'emagrecer' });
    expect(t.kcal).toBe(Math.round(3200 * 0.25 * 1.25));
  });

  it('ganho de massa reserva calorias para a ceia; emagrecimento não', () => {
    const bulk = mealTarget({ goals: goalsBulk, totals: zero, meal: 'jantar', meta: 'massa' });
    const cut = mealTarget({ goals: goalsBulk, totals: zero, meal: 'jantar', meta: 'emagrecer' });
    expect(bulk.kcal).toBeLessThan(cut.kcal);
  });

  it('calorias do dia acabando: fica no piso e marca tight', () => {
    const t = mealTarget({ goals: goalsCut, totals: { kcal: 1750, protein: 120 }, meal: 'jantar', meta: 'emagrecer' });
    expect(t.tight).toBe(true);
    expect(t.kcal).toBe(300);
  });

  it('sem metas, null; refeição "outro" vira lanche', () => {
    expect(mealTarget({ goals: null, totals: zero, meal: 'cafe' })).toBeNull();
    expect(mealTarget({ goals: goalsCut, totals: zero, meal: 'outro', meta: 'saude' }).meal).toBe('lanche');
  });
});

describe('fitMeal', () => {
  const pf = __TEMPLATES.find(tp => tp.id === 'almoco_pf');

  it('mais proteína e calorias no alvo aumentam as porções', () => {
    const small = fitMeal(pf, { kcal: 450, protein: 30 });
    const big = fitMeal(pf, { kcal: 800, protein: 55 });
    expect(big.total.g).toBeGreaterThan(small.total.g);
    expect(big.total.kcal).toBeGreaterThan(small.total.kcal);
    expect(Math.abs(big.total.kcal - 800)).toBeLessThan(100);
    expect(Math.abs(big.total.g - 55)).toBeLessThan(8);
  });

  it('itens prontos para o diário, com ovos em unidades', () => {
    const tp = __TEMPLATES.find(x => x.id === 'cafe_ovos_integral');
    const { items } = fitMeal(tp, { kcal: 450, protein: 30 });
    for (const it of items) expect(it).toMatchObject({ icon: expect.any(String), label: expect.any(String), g: expect.any(Number), kcal: expect.any(Number) });
    expect(items[0].label).toMatch(/ovos? cozidos?/);
    expect(items[0].grams % 50).toBe(0);
  });
});

describe('suggestGoalMeals', () => {
  it('só traz modelos da meta e da refeição', () => {
    const { meals } = suggestGoalMeals({ goals: goalsCut, totals: zero, meal: 'almoco', meta: 'emagrecer', hour: 12 });
    const ids = meals.map(m => m.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('almoco_macarrao');
  });

  it('ganho de massa e emagrecimento recebem refeições diferentes', () => {
    const a = suggestGoalMeals({ goals: goalsBulk, totals: zero, meal: 'cafe', meta: 'massa', hour: 7 }).meals.map(m => m.id);
    const b = suggestGoalMeals({ goals: goalsCut, totals: zero, meal: 'cafe', meta: 'emagrecer', hour: 7 }).meals.map(m => m.id);
    expect(a[0]).not.toBe(b[0]);
  });

  it('perto do treino, o lanche pré-treino sobe para o topo', () => {
    const { meals, window } = suggestGoalMeals({ goals: goalsBulk, totals: { kcal: 1500, protein: 70 }, meal: 'lanche', meta: 'forca', hour: 16, trainingHour: 18 });
    expect(window).toBe('pre');
    expect(meals[0].id).toBe('lanche_pre');
    expect(meals[0].training).toBe('pre');
  });
});

describe('trainingWindow e goalFocus', () => {
  it('pré até 2h30 antes, pós até 2h depois', () => {
    expect(trainingWindow(16, 18)).toBe('pre');
    expect(trainingWindow(19, 18)).toBe('pos');
    expect(trainingWindow(12, 18)).toBeNull();
    expect(trainingWindow(12, null)).toBeNull();
  });

  it('meta desconhecida cai em saúde', () => {
    expect(goalFocus('ganhar').meta).toBe('saude');
    expect(goalFocus('massa').tips).toHaveLength(3);
  });
});
