import { describe, it, expect } from 'vitest';
import { parseTempo } from './tempo';

describe('parseTempo', () => {
  it('lê 3-1-1 dentro do texto da técnica', () => {
    expect(parseTempo('Cadência 3-1-1')).toMatchObject({ label: '3-1-1', down: 3, bottom: 1, up: 1, top: 0 });
  });
  it('lê quatro tempos e o x como zero', () => {
    expect(parseTempo('2-0-x-1')).toMatchObject({ down: 2, bottom: 0, up: 0, top: 1 });
  });
  it('ignora faixas de reps e textos sem cadência', () => {
    expect(parseTempo('8-12')).toBeNull();
    expect(parseTempo('Drop-set na última')).toBeNull();
    expect(parseTempo('')).toBeNull();
    expect(parseTempo(null)).toBeNull();
  });
});
