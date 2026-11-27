// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
vi.mock('./tracking', () => ({ trackFeature: vi.fn() }));

import { DEFAULT_HERO, HAIR_COLORS, OUTFITS, SKIN, celebrationSince, heroTier, sanitizeHero } from './hero';

describe('hero', () => {
  it('garante um herói válido', () => {
    expect(sanitizeHero(null)).toEqual(DEFAULT_HERO);
    expect(sanitizeHero({ body: 3, skin: 6, hair_style: 6, hair_color: 6, outfit: 6 })).toEqual({ body: 3, skin: 6, hair_style: 6, hair_color: 6, outfit: 6 });
    expect(sanitizeHero({ body: 9, skin: 0, hair_style: 'x', hair_color: 2.5, outfit: -1 })).toEqual(DEFAULT_HERO);
  });

  it('tem uma cor para cada opção que o servidor aceita', () => {
    expect(SKIN).toHaveLength(6);
    expect(HAIR_COLORS).toHaveLength(6);
    expect(OUTFITS).toHaveLength(6);
  });

  it('muda o visual por faixa de nível', () => {
    expect(heroTier(1)).toMatchObject({ tier: 1, name: 'Novato', next: { level: 5, name: 'Dedicado' } });
    expect(heroTier(4).tier).toBe(1);
    expect(heroTier(5).tier).toBe(2);
    expect(heroTier(9).tier).toBe(2);
    expect(heroTier(10).tier).toBe(3);
    expect(heroTier(15).tier).toBe(4);
    expect(heroTier(20).tier).toBe(5);
    expect(heroTier(30)).toMatchObject({ tier: 6, name: 'Lenda', next: null });
    expect(heroTier(99).tier).toBe(6);
    expect(heroTier(0).tier).toBe(1);
    expect(heroTier(undefined).tier).toBe(1);
  });

  it('comemora o XP novo desde a última visita', () => {
    expect(celebrationSince(null, { xp: 100, level: 2 })).toBeNull();
    expect(celebrationSince({ xp: 100, level: 2 }, { xp: 100, level: 2 })).toBeNull();
    expect(celebrationSince({ xp: 100, level: 2 }, { xp: 80, level: 2 })).toBeNull();
    expect(celebrationSince({ xp: 100, level: 2 }, { xp: 130, level: 2 })).toEqual({ type: 'xp', amount: 30, level: 2 });
    expect(celebrationSince({ xp: 100, level: 2 }, { xp: 260, level: 3 })).toEqual({ type: 'levelup', amount: 160, level: 3 });
    expect(celebrationSince({ xp: 'x' }, { xp: 5, level: 1 })).toBeNull();
  });
});
