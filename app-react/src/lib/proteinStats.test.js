import { describe, it, expect } from 'vitest';
import { buildProteinSeries, proteinStats } from './proteinStats';

describe('buildProteinSeries', () => {
  it('preenche os dias sem registro com 0 e termina em hoje', () => {
    const s = buildProteinSeries([{ log_date: '2026-10-25', amount_g: 90 }], '2026-10-26', 3);
    expect(s).toEqual([
      { date: '2026-10-24', g: 0 },
      { date: '2026-10-25', g: 90 },
      { date: '2026-10-26', g: 0 },
    ]);
  });
});

describe('proteinStats', () => {
  const series = [80, 120, 120, 100, 0].map((g, i) => ({ date: `d${i}`, g }));

  it('hoje em andamento não quebra a sequência nem entra na média', () => {
    const s = proteinStats(series, 100);
    expect(s.streak).toBe(3); // 100, 120 e 120 batem a meta; o 80 quebra
    expect(s.avg7).toBe(105);
  });

  it('conta hoje quando já bateu a meta', () => {
    const s = proteinStats([...series.slice(0, 4), { date: 'hoje', g: 130 }], 100);
    expect(s.streak).toBe(4);
    expect(s.daysHit).toBe(4);
    expect(s.bestG).toBe(130);
  });

  it('série vazia', () => {
    expect(proteinStats([], 100)).toEqual({ avg7: 0, streak: 0, bestG: 0, daysHit: 0 });
  });
});
