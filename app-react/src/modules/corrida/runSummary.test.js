import { describe, it, expect } from 'vitest';
import { monthSummary } from './runSummary';

const run = (run_date, distance_m, duration_s) => ({ run_date, distance_m, duration_s });

describe('resumo do mês', () => {
  it('soma só o mês de hoje, até hoje', () => {
    const s = monthSummary([
      run('2026-11-02', 5000, 1800), run('2026-11-10', 10000, 3600),
      run('2026-10-30', 8000, 3000), run('2026-11-25', 5000, 1800), // outro mês e dia que ainda não chegou
    ], '2026-11-17');
    expect(s).toEqual({ month: '2026-11', count: 2, meters: 15000, seconds: 5400, pace: 360, longestM: 10000 });
  });

  it('sem corrida no mês não há resumo', () => {
    expect(monthSummary([run('2026-10-30', 5000, 1800)], '2026-11-17')).toBeNull();
    expect(monthSummary([], '2026-11-17')).toBeNull();
  });

  it('abaixo de 1 km no mês não inventa ritmo', () => {
    expect(monthSummary([run('2026-11-02', 600, 300)], '2026-11-17').pace).toBeNull();
  });
});
