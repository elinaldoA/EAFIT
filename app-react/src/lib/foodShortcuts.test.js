import { describe, it, expect, beforeEach } from 'vitest';
import { sortByUse, bumpUseCount, readUseCounts, foodFromRow } from './foodShortcuts';

beforeEach(() => localStorage.clear());

describe('sortByUse', () => {
  const foods = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('põe os mais usados primeiro e mantém a ordem no empate', () => {
    expect(sortByUse(foods, { c: 3, b: 1 }).map(f => f.id)).toEqual(['c', 'b', 'a']);
    expect(sortByUse(foods, {}).map(f => f.id)).toEqual(['a', 'b', 'c']);
  });
  it('não altera a lista original', () => {
    sortByUse(foods, { c: 9 });
    expect(foods.map(f => f.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('contador de uso', () => {
  it('soma por alimento e persiste', () => {
    bumpUseCount('ovo');
    bumpUseCount('ovo');
    bumpUseCount('arroz');
    expect(readUseCounts()).toEqual({ ovo: 2, arroz: 1 });
  });
  it('tolera JSON inválido', () => {
    localStorage.setItem('foodUseCount', '{x');
    expect(readUseCounts()).toEqual({});
  });
});

describe('foodFromRow', () => {
  it('converte a linha do banco para o formato dos atalhos', () => {
    expect(foodFromRow({ id: '1', name: 'Café', icon: '', protein_g: 5, kcal: 200, carbs_g: 30, fat_g: 6 }))
      .toEqual({ id: '1', custom: true, icon: '🍽️', label: 'Café', g: 5, kcal: 200, carbs: 30, fat: 6 });
  });
});
