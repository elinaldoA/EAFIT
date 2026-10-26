import { describe, it, expect } from 'vitest';
import { usesLocal } from './modalidade';

describe('usesLocal', () => {
  it('só a musculação depende do local de treino', () => {
    expect(usesLocal('musculacao')).toBe(true);
    expect(usesLocal('calistenia')).toBe(false);
  });

  it('modalidade ausente (perfis antigos) conta como musculação', () => {
    expect(usesLocal(undefined)).toBe(true);
    expect(usesLocal('')).toBe(true);
  });
});
