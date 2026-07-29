import { describe, it, expect } from 'vitest';
import { parseRepCeiling, parseDecimal } from './utils';

describe('parseRepCeiling', () => {
  it('extrai o teto de uma faixa de reps', () => {
    expect(parseRepCeiling('8-10')).toBe(10);
    expect(parseRepCeiling('12-15')).toBe(15);
  });

  it('aceita um número único como teto', () => {
    expect(parseRepCeiling('12')).toBe(12);
  });

  it('retorna null pra texto sem faixa numérica no formato N-N ou N', () => {
    expect(parseRepCeiling('até a falha (máx 20)')).toBeNull();
    expect(parseRepCeiling('45s')).toBeNull();
    expect(parseRepCeiling('20min · 10% inclinação / 5km/h')).toBeNull();
  });
});

describe('parseDecimal', () => {
  it('aceita decimal em formato pt-BR (vírgula)', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('0,8')).toBe(0.8);
  });

  it('continua aceitando ponto normalmente', () => {
    expect(parseDecimal('12.5')).toBe(12.5);
  });

  it('aceita número inteiro sem separador', () => {
    expect(parseDecimal('150')).toBe(150);
  });

  it('retorna NaN pra texto vazio ou não numérico', () => {
    expect(Number.isNaN(parseDecimal(''))).toBe(true);
    expect(Number.isNaN(parseDecimal('abc'))).toBe(true);
  });
});
