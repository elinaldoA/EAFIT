// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
vi.mock('./tracking', () => ({ trackFeature: vi.fn() }));

import {
  DEFAULT_HERO, HAIR_COLORS, NEUTRAL_PHYSIQUE, OUTFITS, SKIN, celebrationSince, formTier, heroTier, physique,
  sanitizeHero, trainingProfile,
} from './hero';

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

  it('fica neutro sem forma calculada', () => {
    expect(physique(null, 'massa')).toBe(NEUTRAL_PHYSIQUE);
    expect(physique(undefined, 'massa')).toBe(NEUTRAL_PHYSIQUE);
    expect(physique('x', 'massa')).toBe(NEUTRAL_PHYSIQUE);
    expect(formTier(null)).toBeNull();
    expect(formTier(undefined)).toBeNull();
  });

  it('quanto mais treino, mais forte e definido; quanto menos, o inverso', () => {
    const steps = [0, 20, 45, 70, 100].map(score => physique(score, 'massa'));
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].arm).toBeGreaterThan(steps[i - 1].arm);
      expect(steps[i].shoulder).toBeGreaterThan(steps[i - 1].shoulder);
      expect(steps[i].abs).toBeGreaterThanOrEqual(steps[i - 1].abs);
      expect(steps[i].belly).toBeLessThan(steps[i - 1].belly);
      expect(steps[i].waist).toBeLessThan(steps[i - 1].waist);
    }
    const out = physique(0, 'massa');
    expect(out).toMatchObject({ belly: 1, abs: 0, slump: 1, tired: 1 });
    const peak = physique(100, 'massa');
    expect(peak.slump).toBe(0);
    expect(peak.tired).toBe(0);
    expect(peak.abs).toBeGreaterThan(0.4);
    expect(peak.bicep).toBe(1);
  });

  it('o objetivo define a direção do corpo', () => {
    const massa = physique(100, 'massa');
    const emagrecer = physique(100, 'emagrecer');
    const definicao = physique(100, 'definicao');
    expect(massa.arm).toBeGreaterThan(emagrecer.arm);
    expect(massa.shoulder).toBeGreaterThan(definicao.shoulder);
    expect(definicao.abs).toBeGreaterThan(massa.abs);
    expect(emagrecer.belly).toBe(0);
    expect(massa.belly).toBeGreaterThan(0);
    // objetivo desconhecido cai em "saúde"
    expect(physique(60, 'xyz')).toEqual(physique(60, 'saude'));
    // forma baixa é igual em estrutura para todos: barriga cheia
    expect(physique(0, 'emagrecer').belly).toBe(1);
  });

  it('dá nome à fase do corpo conforme o objetivo', () => {
    expect(formTier(0).name).toBe('Fora de forma');
    expect(formTier(25).name).toBe('Voltando à rotina');
    expect(formTier(50, 'massa').name).toBe('Em forma');
    expect(formTier(75, 'massa').name).toBe('Forte');
    expect(formTier(75, 'emagrecer').name).toBe('Definido');
    expect(formTier(95).name).toBe('No auge');
    expect(formTier(95).next).toBeNull();
    expect(formTier(50).next).toEqual({ score: 70, name: 'Definido' });
  });

  it('lê objetivo e meta semanal do perfil', () => {
    expect(trainingProfile({ meta: 'emagrecer', weeklyGoal: '4' })).toEqual({ goal: 'emagrecer', weeklyGoal: 4 });
    expect(trainingProfile({ weeklyGoal: '0' })).toEqual({ goal: 'massa', weeklyGoal: 5 });
    expect(trainingProfile({ weeklyGoal: '9' }).weeklyGoal).toBe(5);
    expect(trainingProfile(null)).toEqual({ goal: 'massa', weeklyGoal: 5 });
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
