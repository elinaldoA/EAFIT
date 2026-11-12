import { describe, it, expect } from 'vitest';
import { heightToCm, validateBody, cleanName, validWeeklyGoal, validWaterGoal } from './profileValidation';

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

describe('heightToCm', () => {
  it('converte metros (com vírgula ou ponto) em centímetros', () => {
    expect(heightToCm('1,78')).toBe('178');
    expect(heightToCm('1.78')).toBe('178');
    expect(heightToCm('2')).toBe('200');
    expect(heightToCm(1.65)).toBe('165');
    expect(heightToCm('1,785')).toBe('179');
  });

  it('não mexe no que já está em centímetros nem no que não é altura', () => {
    expect(heightToCm('178')).toBe('178');
    expect(heightToCm('100')).toBe('100');
    expect(heightToCm('')).toBe('');
    expect(heightToCm('abc')).toBe('abc');
    expect(heightToCm('0.5')).toBe('0.5'); // abaixo de 1 m: segue inválido
    expect(heightToCm('3')).toBe('3'); // acima de 2,5: não é metro nem centímetro válido
    expect(heightToCm(undefined)).toBeUndefined();
  });

  it('o resultado passa na validação do cadastro', () => {
    expect(validateBody({ sexo: 'M', idade: '30', peso: '80', altura: heightToCm('1,78') }, { onboarding: true })).toBeNull();
  });
});
