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
