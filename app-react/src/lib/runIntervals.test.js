import { describe, it, expect } from 'vitest';
import { parseRunWalk, phaseAt } from './runIntervals';

const MIN = 60000;

describe('parseRunWalk', () => {
  it('lê o texto gerado pelo programa de corrida', () => {
    expect(parseRunWalk('24min · 2min corre / 2min caminha')).toEqual({ total: 24, run: 2, walk: 2 });
    expect(parseRunWalk('30min · 12min corre / 1min caminha')).toEqual({ total: 30, run: 12, walk: 1 });
  });

  it('devolve null para outros textos', () => {
    expect(parseRunWalk('40min · ritmo leve')).toBeNull();
    expect(parseRunWalk('8x400m forte / 200m trote')).toBeNull();
    expect(parseRunWalk('')).toBeNull();
    expect(parseRunWalk(undefined)).toBeNull();
  });
});

describe('phaseAt', () => {
  const rw = { total: 9, run: 2, walk: 1 }; // 3 voltas de 3 min

  it('começa correndo e mostra quanto falta na fase', () => {
    expect(phaseAt(0, rw)).toEqual({ phase: 'run', remainingMs: 2 * MIN, round: 1 });
    expect(phaseAt(90000, rw)).toEqual({ phase: 'run', remainingMs: 30000, round: 1 });
  });

  it('troca para caminhar e volta a correr na volta seguinte', () => {
    expect(phaseAt(2 * MIN, rw)).toEqual({ phase: 'walk', remainingMs: MIN, round: 1 });
    expect(phaseAt(3 * MIN, rw)).toEqual({ phase: 'run', remainingMs: 2 * MIN, round: 2 });
    expect(phaseAt(8 * MIN, rw)).toEqual({ phase: 'walk', remainingMs: MIN, round: 3 });
  });

  it('termina no tempo total', () => {
    expect(phaseAt(9 * MIN, rw).phase).toBe('done');
    expect(phaseAt(20 * MIN, rw).phase).toBe('done');
  });

  it('corta a última fase no total quando o tempo não fecha em voltas', () => {
    const odd = { total: 7, run: 3, walk: 2 }; // 5 + 2
    expect(phaseAt(5 * MIN, odd)).toEqual({ phase: 'run', remainingMs: 2 * MIN, round: 2 });
  });
});
