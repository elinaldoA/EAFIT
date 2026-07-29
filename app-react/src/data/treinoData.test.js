import { describe, it, expect, beforeEach } from 'vitest';
import { getWaterGoalLiters, DEFAULT_WATER_GOAL } from './treinoData';

describe('getWaterGoalLiters', () => {
  beforeEach(() => localStorage.clear());

  it('retorna o default quando não há usuário nem dados salvos', () => {
    expect(getWaterGoalLiters(null)).toBe(DEFAULT_WATER_GOAL);
  });

  it('calcula a meta a partir do peso (0.035L/kg) quando o perfil tem peso', () => {
    const user = { user_metadata: { peso: 80 } };
    expect(getWaterGoalLiters(user)).toBe(2.8);
  });

  it('dá prioridade a um valor salvo explicitamente sobre o calculado', () => {
    const user = { user_metadata: { peso: 80, macroAgua: 4 } };
    expect(getWaterGoalLiters(user)).toBe(4);
  });

  it('cai para o valor salvo no localStorage quando o perfil está incompleto', () => {
    localStorage.setItem('profile_macroAgua', '2.5');
    expect(getWaterGoalLiters(null)).toBe(2.5);
  });

  it('não calcula a partir do perfil se faltar o peso', () => {
    expect(getWaterGoalLiters({ user_metadata: {} })).toBe(DEFAULT_WATER_GOAL);
  });
});
