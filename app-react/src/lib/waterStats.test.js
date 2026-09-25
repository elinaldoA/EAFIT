import { describe, it, expect } from 'vitest';
import { buildDailySeries, waterStats } from './waterStats';

describe('buildDailySeries', () => {
  it('preenche os dias sem registro com 0 e termina na data final', () => {
    const series = buildDailySeries([
      { log_date: '2026-09-23', amount_ml: 2000 },
      { log_date: '2026-09-25', amount_ml: 500 },
      { log_date: '2026-08-01', amount_ml: 9999 },
    ], '2026-09-25', 4);
    expect(series).toEqual([
      { date: '2026-09-22', ml: 0 },
      { date: '2026-09-23', ml: 2000 },
      { date: '2026-09-24', ml: 0 },
      { date: '2026-09-25', ml: 500 },
    ]);
  });

  it('atravessa a virada de mês', () => {
    expect(buildDailySeries([], '2026-10-01', 2).map(d => d.date)).toEqual(['2026-09-30', '2026-10-01']);
  });
});

describe('waterStats', () => {
  const day = (ml, i) => ({ date: `2026-09-${String(10 + i).padStart(2, '0')}`, ml });

  it('sequência conta dias seguidos na meta até ontem, e hoje só se já bateu', () => {
    const series = [1000, 3000, 3000, 3200, 500].map(day);
    expect(waterStats(series, 3000).streak).toBe(3);
    const hitToday = [1000, 3000, 3000, 3200, 3000].map(day);
    expect(waterStats(hitToday, 3000).streak).toBe(4);
    expect(waterStats([3000, 1000, 500].map(day), 3000).streak).toBe(0);
  });

  it('média dos últimos 7 dias ignora hoje', () => {
    const series = [9000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 0].map(day);
    expect(waterStats(series, 3000).avg7).toBe(1000);
  });

  it('melhor dia e dias na meta', () => {
    const s = waterStats([2000, 3500, 3000, 100].map(day), 3000);
    expect(s.bestMl).toBe(3500);
    expect(s.daysHit).toBe(2);
  });

  it('série vazia não quebra', () => {
    expect(waterStats([], 3000)).toEqual({ avg7: 0, streak: 0, bestMl: 0, daysHit: 0 });
  });
});
