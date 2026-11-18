// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { FAVORITES_MAX, isFavorite, readFavorites, resetFavoritesForTests, toggleFavorite } from './favorites';

beforeEach(() => { localStorage.clear(); resetFavoritesForTests(); });

describe('favorites', () => {
  it('fixa e desafixa, guardando no storage', () => {
    expect(toggleFavorite('/users')).toBe(true);
    expect(isFavorite('/users')).toBe(true);
    expect(JSON.parse(localStorage.getItem('adminFavorites'))).toEqual(['/users']);
    toggleFavorite('/users');
    expect(readFavorites()).toEqual([]);
  });

  it('respeita o limite', () => {
    for (let i = 0; i < FAVORITES_MAX; i += 1) toggleFavorite(`/t${i}`);
    expect(toggleFavorite('/extra')).toBe(false);
    expect(readFavorites()).toHaveLength(FAVORITES_MAX);
  });

  it('ignora storage corrompido', () => {
    localStorage.setItem('adminFavorites', '{ruim');
    resetFavoritesForTests();
    expect(readFavorites()).toEqual([]);
  });
});
