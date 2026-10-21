import { describe, it, expect } from 'vitest';
import { validateBody, cleanName, validWeeklyGoal, validWaterGoal } from './profileValidation';

const ok = { sexo: 'M', idade: '30', peso: '80', altura: '180' };

describe('validateBody', () => {
  it('dados válidos passam', () => {
    expect(validateBody(ok)).toBeNull();
    expect(validateBody(ok, { onboarding: true })).toBeNull();
    expect(validateBody({ ...ok, peso: '80,5', pesoAlvo: '75' })).toBeNull();
  });

  it('onboarding exige sexo e idade; o Perfil aceita vazios', () => {
    expect(validateBody({ ...ok, sexo: '' }, { onboarding: true })?.field).toBe('idade');
    expect(validateBody({ ...ok, idade: '' }, { onboarding: true })?.field).toBe('idade');
    expect(validateBody({ ...ok, sexo: '', idade: '' })).toBeNull();
  });

  it.each([
    [{ idade: '10' }, 'idade'],
    [{ sexo: 'X' }, 'sexo'],
    [{ peso: '' }, 'peso'],
    [{ peso: 'abc' }, 'peso'],
    [{ peso: '500' }, 'peso'],
    [{ altura: '1.78' }, 'altura'],
    [{ altura: '' }, 'altura'],
    [{ pesoAlvo: '5' }, 'pesoAlvo'],
  ])('recusa %j', (patch, field) => {
    expect(validateBody({ ...ok, ...patch })?.field).toBe(field);
  });
});

describe('demais campos', () => {
  it('cleanName tira espaços e limita o tamanho', () => {
    expect(cleanName('  Ana   Maria ')).toBe('Ana Maria');
    expect(cleanName(undefined)).toBe('');
    expect(cleanName('a'.repeat(80))).toHaveLength(50);
  });

  it('meta semanal de 1 a 7 e água vazia ou de 0,5 a 10 L', () => {
    expect(validWeeklyGoal('4')).toBe(true);
    expect(['0', '8', '', '2.5'].some(validWeeklyGoal)).toBe(false);
    expect(['', '3', '0,5', '10'].every(validWaterGoal)).toBe(true);
    expect(['0', '-1', '50', 'x'].some(validWaterGoal)).toBe(false);
  });
});
