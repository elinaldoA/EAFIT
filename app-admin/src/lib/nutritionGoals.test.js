import { describe, it, expect } from 'vitest';
import { computeNutritionGoals } from './nutritionGoals';

describe('computeNutritionGoals (admin)', () => {
  it('bate com a regra do app', () => {
    // mesmo caso de app-react/src/lib/nutritionGoals.test.js
    expect(computeNutritionGoals({ sexo: 'M', idade: '30', peso: '80', altura: '180', meta: 'saude', weeklyGoal: 4 }))
      .toMatchObject({ kcal: 2760, protein: 112 });
  });

  it('null sem dados do corpo', () => {
    expect(computeNutritionGoals({})).toBeNull();
    expect(computeNutritionGoals({ sexo: 'M', idade: '30', peso: '80' })).toBeNull();
  });
});
