import { describe, it, expect } from 'vitest';
import { adaptRest, restDelta } from './restAdapt';

describe('adaptRest', () => {
  it('série até a falha ganha 30 s', () => expect(adaptRest(90, 0)).toBe(120));
  it('série leve perde 15 s, com piso de 45', () => {
    expect(adaptRest(90, 3)).toBe(75);
    expect(adaptRest(60, 4)).toBe(45);
  });
  it('RIR intermediário, ausente ou descanso curto não mudam', () => {
    expect(adaptRest(90, 2)).toBe(90);
    expect(adaptRest(90, '')).toBe(90);
    expect(adaptRest(90, null)).toBe(90);
    expect(adaptRest(30, 0)).toBe(30);
    expect(adaptRest(0, 0)).toBe(0);
  });
  it('restDelta é a diferença entre dois RIR', () => expect(restDelta(90, null, 0)).toBe(30));
});
