import { describe, it, expect } from 'vitest';
import { computeNutritionGoals, goalKcalFactor, nutritionProfile } from './nutritionGoals';

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

  it('sem treinos por semana salvos usa o padrão de 5', () => {
    const { weeklyGoal: _w, ...semMeta } = base;
    expect(computeNutritionGoals(semMeta).kcal).toBe(computeNutritionGoals({ ...base, weeklyGoal: 5 }).kcal);
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

describe('fibra, sódio e fator da meta', () => {
  it('fibra a 14 g por 1000 kcal e teto de sódio de 2000 mg', () => {
    const g = computeNutritionGoals(base);
    expect(g.fiber).toBe(Math.round((g.kcal / 1000) * 14));
    expect(g.sodium).toBe(2000);
  });

  it('fator de calorias por meta, saúde sem meta conhecida', () => {
    expect(goalKcalFactor('emagrecer')).toBe(0.8);
    expect(goalKcalFactor('massa')).toBe(1.1);
    expect(goalKcalFactor(undefined)).toBe(1);
  });
});

describe('nutritionProfile', () => {
  const store = data => ({ getItem: k => data[k] ?? null });

  it('usa o que está na conta', () => {
    expect(nutritionProfile({ ...base }, store({ profile_meta: 'emagrecer' }))).toMatchObject(base);
  });

  it('sem o dado na conta, lê a cópia do aparelho, como o Perfil', () => {
    const p = nutritionProfile({ sexo: 'M', idade: 30, peso: 80, altura: 180 }, store({ profile_meta: 'emagrecer', profile_weeklyGoal: '3' }));
    expect(p).toMatchObject({ meta: 'emagrecer', weeklyGoal: '3' });
  });

  it('sem meta em lugar nenhum, vale a do cadastro (massa): Nutrição e Perfil mostram o mesmo número', () => {
    const p = nutritionProfile({ sexo: 'M', idade: 30, peso: 80, altura: 180 }, store({}));
    expect(p.meta).toBe('massa');
    const g = computeNutritionGoals(p);
    expect(g).toMatchObject({ kcal: 3030, protein: 160 });
  });

  it('aparelho sem armazenamento não quebra', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); } };
    expect(nutritionProfile({}, broken).meta).toBe('massa');
  });
});
