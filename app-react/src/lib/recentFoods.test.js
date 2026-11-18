import { describe, it, expect } from 'vitest';
import { recentFoods, usedNames, yesterdayMeal } from './recentFoods';

const row = (log_date, meal, name, kcal = 100) => ({ log_date, meal, name, icon: '🍚', protein_g: 5, kcal, carbs_g: 10, fat_g: 1, fiber_g: null, sodium_mg: null });

describe('recentFoods', () => {
  it('mais repetidos primeiro, depois os mais recentes; junta com o dia de hoje', () => {
    const rows = [row('2026-11-15', 'cafe', 'Ovo 100g'), row('2026-11-16', 'cafe', 'Ovo 100g'), row('2026-11-17', 'almoco', 'Arroz 150g'), row('2026-11-14', 'almoco', 'Feijão 100g')];
    const today = [{ label: 'Banana 70g', icon: '🍌', g: 1, kcal: 60, carbs: 15, fat: 0, meal: 'cafe' }];
    expect(recentFoods(rows, today, '2026-11-18').map(f => f.label)).toEqual(['Ovo 100g', 'Banana 70g', 'Arroz 150g', 'Feijão 100g']);
  });
  it('limita e ignora linhas sem nome', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row('2026-11-1' + (i % 8), 'cafe', `Item ${i}`)).concat([row('2026-11-10', 'cafe', '')]);
    expect(recentFoods(rows, [], '2026-11-18', 5)).toHaveLength(5);
  });
  it('usedNames tira a porção e o acento', () => {
    expect([...usedNames([{ label: 'Feijão carioca cozido 140g' }, { label: 'Ovo 2,5 g' }])]).toEqual(['feijao carioca cozido', 'ovo']);
  });
  it('yesterdayMeal só quando ontem teve a refeição e hoje ainda não', () => {
    const rows = [row('2026-11-17', 'cafe', 'Pão 50g'), row('2026-11-17', 'almoco', 'Arroz 150g')];
    expect(yesterdayMeal(rows, [], 'cafe', '2026-11-17').map(f => f.label)).toEqual(['Pão 50g']);
    expect(yesterdayMeal(rows, [{ meal: 'cafe' }], 'cafe', '2026-11-17')).toEqual([]);
    expect(yesterdayMeal(rows, [], 'jantar', '2026-11-17')).toEqual([]);
  });
});
