import { describe, it, expect } from 'vitest';
import { repeatedNames, isRepeatedName } from './planDuplicates';

describe('repeatedNames', () => {
  it('acha o mesmo nome em força e pós-treino, ignorando caixa, espaços e emoji', () => {
    const r = repeatedNames([{ nome: 'Prancha' }, { nome: 'Supino' }], [{ nome: '🔷 prancha ' }]);
    expect([...r]).toEqual(['prancha']);
    expect(isRepeatedName('PRANCHA', r)).toBe(true);
    expect(isRepeatedName('Supino', r)).toBe(false);
  });
  it('nomes em branco e listas sem repetição não avisam', () => {
    expect(repeatedNames([{ nome: '' }, { nome: ' ' }, { nome: 'A' }]).size).toBe(0);
    expect(isRepeatedName('A', undefined)).toBe(false);
  });
});
