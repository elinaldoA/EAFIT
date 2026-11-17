import { describe, it, expect } from 'vitest';
import { weatherBands, bandOf } from './weatherInsights';

// 5 km em `min` minutos = ritmo de min/5 por km.
const run = (t, min = 30) => ({ duration_s: min * 60, distance_m: 5000, weather: { t, c: 0 } });

describe('clima e ritmo', () => {
  it('separa as faixas de temperatura', () => {
    expect([10, 15, 16, 27, 28, 35].map(bandOf)).toEqual(['frio', 'frio', 'ameno', 'ameno', 'calor', 'calor']);
  });

  it('com poucas corridas com clima não mostra nada', () => {
    expect(weatherBands([run(20), run(22)])).toBeNull();
    expect(weatherBands([{ duration_s: 1800, distance_m: 5000 }, run(20), run(22)])).toBeNull(); // sem clima não conta
  });

  it('agrupa por faixa, com o ritmo médio e a temperatura média', () => {
    const r = weatherBands([run(12, 30), run(20, 28), run(22, 28), run(30, 35), run(32, 35)]);
    expect(r.total).toBe(5);
    expect(r.avgTemp).toBe(23);
    expect(r.bands).toEqual([
      { key: 'frio', runs: 1, pace: 360 },
      { key: 'ameno', runs: 2, pace: 336 },
      { key: 'calor', runs: 2, pace: 420 },
    ]);
    expect(r.fastest).toBe('ameno');
  });

  it('esconde a faixa sem corridas e não aponta a mais rápida com uma só', () => {
    const r = weatherBands([run(20), run(21), run(22)]);
    expect(r.bands.map(b => b.key)).toEqual(['ameno']);
    expect(r.fastest).toBeNull();
  });

  it('corrida curta entra na contagem, mas não no ritmo', () => {
    const short = { duration_s: 200, distance_m: 500, weather: { t: 20, c: 0 } };
    const r = weatherBands([short, run(20, 30), run(21, 30)]);
    expect(r.bands[0]).toEqual({ key: 'ameno', runs: 3, pace: 360 });
  });

  it('o mínimo pode ser menor (cartão do mês): com 1 corrida já agrupa, sem apontar a mais rápida', () => {
    const r = weatherBands([run(20)], 1);
    expect(r.total).toBe(1);
    expect(r.bands).toEqual([{ key: 'ameno', runs: 1, pace: 360 }]);
    expect(r.fastest).toBeNull();
    expect(weatherBands([run(20)])).toBeNull(); // padrão continua 3
    expect(weatherBands([], 1)).toBeNull();
  });
});
