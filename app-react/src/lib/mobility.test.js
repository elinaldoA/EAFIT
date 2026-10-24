import { describe, it, expect, beforeEach } from 'vitest';
import {
  MOBILITY_MOVES, moveTiming, routineSeconds, buildMobilityRoutine, isMobilityDone, markMobilityDone,
} from './mobility';

describe('moveTiming', () => {
  it('lê tempo, repetições e lados da dose', () => {
    expect(moveTiming({ dose: '30s cada lado' })).toEqual({ seconds: 60, sides: true });
    expect(moveTiming({ dose: '45s' })).toEqual({ seconds: 45, sides: false });
    expect(moveTiming({ dose: '10 cada lado' })).toEqual({ seconds: 60, sides: true });
    expect(moveTiming({ dose: '5', secs: 40 })).toEqual({ seconds: 40, sides: false });
    expect(moveTiming({ dose: '4' })).toEqual({ seconds: 20, sides: false });
  });
});

describe('buildMobilityRoutine', () => {
  it('antes do treino: abre com o movimento geral e só usa dinâmicos', () => {
    const r = buildMobilityRoutine(new Set(['chest', 'shoulders', 'triceps']), 'pre', 4, 1);
    expect(r[0].nome).toBe('Gato-Vaca');
    expect(r.every(m => m.fase === 'pre')).toBe(true);
    expect(r.some(m => m.musculos.includes('chest'))).toBe(true);
  });

  it('depois do treino: fecha com a respiração', () => {
    const r = buildMobilityRoutine(['quads', 'calves'], 'pos', 5, 1);
    expect(r[r.length - 1].nome).toBe('Respiração Diafragmática');
    expect(r.some(m => m.musculos.includes('calves'))).toBe(true);
  });

  it('cabe no tempo pedido e não repete movimento', () => {
    [3, 5, 8].forEach(min => {
      const r = buildMobilityRoutine(null, 'pos', min, 3);
      expect(routineSeconds(r)).toBeLessThanOrEqual(min * 60);
      expect(new Set(r.map(m => m.nome)).size).toBe(r.length);
    });
  });

  it('sem músculos, cobre o corpo todo', () => {
    const r = buildMobilityRoutine(new Set(), 'pos', 10, 0);
    const covered = new Set(r.flatMap(m => m.musculos));
    expect(covered.size).toBeGreaterThanOrEqual(7);
  });

  it('todo movimento tem nome, técnica e fase', () => {
    MOBILITY_MOVES.forEach(m => {
      expect(m.nome).toBeTruthy();
      expect(m.tecnica).toBeTruthy();
      expect(['pre', 'pos']).toContain(m.fase);
    });
  });
});

describe('marca de feito', () => {
  beforeEach(() => localStorage.clear());

  it('marca hoje e limpa as de outros dias', () => {
    localStorage.setItem('mobility_2000-01-01_pre', 'true');
    expect(isMobilityDone('pre')).toBe(false);
    markMobilityDone('pre');
    expect(isMobilityDone('pre')).toBe(true);
    expect(isMobilityDone('pos')).toBe(false);
    expect(localStorage.getItem('mobility_2000-01-01_pre')).toBeNull();
  });
});
