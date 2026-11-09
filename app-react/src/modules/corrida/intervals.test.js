import { describe, it, expect } from 'vitest';
import { repResult, cleanReps, repPace, repsSummary } from './intervals';
import { buildSteps, normalizeWorkout } from './workout';

const work = { type: 'work', unit: 'm', value: 400, rep: 3 };

describe('resultado do tiro', () => {
  it('tiro em metros: tempo e distância desde o começo da etapa', () => {
    expect(repResult(work, { index: 2, startS: 600, startM: 1000 }, 698, 1403)).toEqual({ rep: 3, s: 98, m: 403 });
  });

  it('só tiros contam (trote, aquecimento e fim não)', () => {
    const pos = { index: 0, startS: 0, startM: 0 };
    expect(repResult({ type: 'rest', unit: 'm', value: 200, rep: 1 }, pos, 60, 200)).toBeNull();
    expect(repResult({ type: 'warmup', unit: 's', value: 600, rep: null }, pos, 600, 1500)).toBeNull();
    expect(repResult(undefined, pos, 60, 200)).toBeNull();
  });

  it('descarta resultado que passou muito do esperado (app em segundo plano)', () => {
    expect(repResult(work, { index: 2, startS: 600, startM: 1000 }, 900, 1700)).toBeNull();
    // Lento, mas dentro do esperado em metros: é um tiro de verdade e fica.
    expect(repResult(work, { index: 2, startS: 600, startM: 1000 }, 900, 1400)).toEqual({ rep: 3, s: 300, m: 400 });
    expect(repResult({ type: 'work', unit: 's', value: 60, rep: 1 }, { index: 1, startS: 0, startM: 0 }, 400, 900)).toBeNull();
  });

  it('funciona com os tiros de um treino montado', () => {
    const steps = buildSteps(normalizeWorkout({ warmupMin: 0, reps: 2, work: { unit: 's', value: 60 }, rest: { unit: 's', value: 30 }, cooldownMin: 0 }));
    expect(repResult(steps[0], { index: 0, startS: 0, startM: 0 }, 60, 250)).toEqual({ rep: 1, s: 60, m: 250 });
  });
});

describe('lista de tiros', () => {
  it('limpa o lixo e não repete o número do tiro', () => {
    expect(cleanReps(null)).toEqual([]);
    expect(cleanReps([{ rep: 1, s: 98, m: 400 }, { rep: 1, s: 90, m: 400 }, { rep: 'x', s: 5, m: 5 }, { rep: 2, s: 0, m: 400 }, { rep: 3, s: 100.4, m: 399.6 }]))
      .toEqual([{ rep: 1, s: 98, m: 400 }, { rep: 3, s: 100, m: 400 }]);
  });

  it('guarda no máximo 60 tiros', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ rep: i + 1, s: 60, m: 250 }));
    expect(cleanReps(many)).toHaveLength(60);
  });

  it('ritmo de 400 m em 1:40 é 4:10/km; sem distância medida não há ritmo', () => {
    expect(repPace({ rep: 1, s: 100, m: 400 })).toBe(250);
    expect(repPace({ rep: 1, s: 60, m: 0 })).toBeNull();
  });

  it('resumo: mais rápido, mais lento e média ponderada pela distância', () => {
    const reps = [{ rep: 1, s: 100, m: 400 }, { rep: 2, s: 96, m: 400 }, { rep: 3, s: 104, m: 400 }, { rep: 4, s: 60, m: 0 }];
    expect(repsSummary(reps)).toEqual({ bestRep: 2, fastest: 240, slowest: 260, avg: 250, count: 3 });
    expect(repsSummary([{ rep: 1, s: 60, m: 0 }])).toBeNull();
    expect(repsSummary([])).toBeNull();
  });
});
