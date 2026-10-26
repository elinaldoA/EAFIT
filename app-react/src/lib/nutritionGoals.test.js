import { describe, it, expect } from 'vitest';
import { computeNutritionGoals } from './nutritionGoals';

const base = { sexo: 'M', idade: '30', peso: '80', altura: '180', meta: 'saude', weeklyGoal: 4 };

describe('computeNutritionGoals', () => {
  it('devolve null sem dados do corpo', () => {
    expect(computeNutritionGoals()).toBeNull();
    expect(computeNutritionGoals({ ...base, sexo: '' })).toBeNull();
    expect(computeNutritionGoals({ ...base, peso: '' })).toBeNull();
    expect(computeNutritionGoals({ ...base, idade: '5' })).toBeNull();
  });

  it('calcula a manutenção pelo Mifflin-St Jeor', () => {
    // BMR 1780 x 1,55 = 2759 -> 2760
    const g = computeNutritionGoals(base);
    expect(g.kcal).toBe(2760);
    expect(g.protein).toBe(112);
  });

  it('põe mais calorias para massa e menos para emagrecer', () => {
    const maintain = computeNutritionGoals(base).kcal;
    expect(computeNutritionGoals({ ...base, meta: 'massa' }).kcal).toBeGreaterThan(maintain);
    expect(computeNutritionGoals({ ...base, meta: 'emagrecer' }).kcal).toBeLessThan(maintain);
  });

  it('as calorias dos macros fecham com a meta', () => {
    const g = computeNutritionGoals({ ...base, meta: 'definicao' });
    expect(Math.abs(g.protein * 4 + g.carbs * 4 + g.fat * 9 - g.kcal)).toBeLessThan(10);
  });

  it('respeita o piso de calorias', () => {
    const g = computeNutritionGoals({ sexo: 'F', idade: '60', peso: '40', altura: '150', meta: 'emagrecer', weeklyGoal: 1 });
    expect(g.kcal).toBe(1200);
  });
});
