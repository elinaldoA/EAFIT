import { describe, it, expect } from 'vitest';
import { heightToCm, bodyErrors, cleanName, validWeeklyGoal, validWaterGoal } from './profileValidation';

const ok = { sexo: 'M', idade: '30', peso: '80', altura: '180' };

describe('bodyErrors — cada regra', () => {
  it('dados válidos passam, com vírgula decimal e peso alvo', () => {
    expect(bodyErrors(ok)).toEqual({});
    expect(bodyErrors(ok, { onboarding: true })).toEqual({});
    expect(bodyErrors({ ...ok, peso: '80,5', pesoAlvo: '75' })).toEqual({});
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
    expect(Object.keys(bodyErrors({ ...ok, ...patch }))).toEqual([field]);
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
    expect(bodyErrors({ sexo: 'M', idade: '30', peso: '80', altura: heightToCm('1,78') }, { onboarding: true })).toEqual({});
  });
});

describe('bodyErrors', () => {
  const ok = { sexo: 'M', idade: '30', peso: '80', altura: '180' };
  it('tudo certo: nenhum erro', () => {
    expect(bodyErrors(ok, { onboarding: true })).toEqual({});
  });
  it('devolve todos os campos com problema de uma vez', () => {
    expect(Object.keys(bodyErrors({ sexo: '', idade: '3', peso: '850', altura: '1' }, { onboarding: true }))).toEqual(['sexo', 'idade', 'peso', 'altura']);
  });
  it('fora do cadastro, sexo e idade vazios valem (contas antigas)', () => {
    expect(bodyErrors({ ...ok, sexo: '', idade: '' })).toEqual({});
    expect(Object.keys(bodyErrors({ ...ok, sexo: '', idade: '' }, { onboarding: true }))).toEqual(['sexo', 'idade']);
  });
  it('aceita vírgula decimal', () => {
    expect(bodyErrors({ ...ok, peso: '80,5' }, { onboarding: true })).toEqual({});
  });
});
