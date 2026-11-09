import { describe, it, expect } from 'vitest';
import { addAltitude, elevationGain, emptyElevation } from './elevation';

const feed = (alts, acc = 5) => alts.reduce((e, a) => addAltitude(e, a, acc), emptyElevation());

// Ruído gaussiano com semente fixa (o teste não muda de uma rodada para outra).
function gauss(seed) {
  let s = seed;
  const next = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 1) / 2147483649; };
  return sigma => Math.sqrt(-2 * Math.log(next())) * Math.cos(2 * Math.PI * next()) * sigma;
}

describe('elevação', () => {
  it('sem altitude do GPS fica null', () => {
    expect(elevationGain(emptyElevation())).toBeNull();
    expect(elevationGain(feed([null, undefined]))).toBeNull();
  });

  it('30 min no plano com ruído de ±4 m quase não somam subida', () => {
    const noise = gauss(7);
    const flat = Array.from({ length: 1800 }, () => 100 + noise(4));
    expect(elevationGain(feed(flat))).toBeLessThanOrEqual(10);
  });

  it('uma ladeira de 30 m (com ruído) conta perto de 30 m de subida e a volta como descida', () => {
    const noise = gauss(3);
    const hill = [
      ...Array.from({ length: 600 }, (_, i) => 100 + i * 0.05),
      ...Array(200).fill(130),
      ...Array.from({ length: 600 }, (_, i) => 130 - i * 0.05),
      ...Array(200).fill(100),
    ].map(a => a + noise(4));
    const e = feed(hill);
    expect(e.gain).toBeGreaterThan(22);
    expect(e.gain).toBeLessThan(42);
    expect(e.loss).toBeGreaterThan(22);
  });

  it('descarta leitura com precisão vertical ruim', () => {
    const e = addAltitude(feed([100]), 300, 80);
    expect(e.smooth).toBe(100);
  });
});

describe('subida por km', () => {
  it('foto vazia sem altitude e cumulativa com altitude', async () => {
    const { elevMark } = await import('./elevation');
    expect(elevMark(null)).toBeNull();
    expect(elevMark({ smooth: null, ref: null, gain: 0, loss: 0 })).toBeNull();
    expect(elevMark({ smooth: 100, ref: 100, gain: 12.4, loss: 3 })).toEqual({ g: 12.4, l: 3 });
  });

  it('diferença entre as fotos de cada km', async () => {
    const { kmElevOf } = await import('./elevation');
    const marks = [{ g: 10, l: 0 }, { g: 10, l: 6 }, { g: 25, l: 6 }];
    expect(kmElevOf(marks, 3)).toEqual([[10, 0], [0, 6], [15, 0]]);
  });

  it('km sem altitude vale 0 e não atrapalha o seguinte; tudo sem altitude é null', async () => {
    const { kmElevOf } = await import('./elevation');
    expect(kmElevOf([{ g: 8, l: 0 }, null, { g: 20, l: 4 }], 3)).toEqual([[8, 0], [0, 0], [12, 4]]);
    expect(kmElevOf([null, null], 2)).toBeNull();
    expect(kmElevOf(undefined, 2)).toBeNull();
    expect(kmElevOf([], 0)).toBeNull();
  });

  it('só conta os km completos', async () => {
    const { kmElevOf } = await import('./elevation');
    expect(kmElevOf([{ g: 5, l: 0 }, { g: 9, l: 0 }], 1)).toEqual([[5, 0]]);
  });

  it('lista do banco: só pares válidos; qualquer lixo descarta tudo', async () => {
    const { cleanKmElev } = await import('./elevation');
    expect(cleanKmElev(null)).toEqual([]);
    expect(cleanKmElev([[10, 2], [0, 7.4]])).toEqual([[10, 2], [0, 7]]);
    expect(cleanKmElev([[10, 2], ['x', 1]])).toEqual([]);
    expect(cleanKmElev([[-1, 2]])).toEqual([]);
    expect(cleanKmElev(Array.from({ length: 700 }, () => [1, 1]))).toHaveLength(600);
  });
});
