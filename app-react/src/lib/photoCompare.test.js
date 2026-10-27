import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { daysBetween, recordAt, buildComparison } from './photoCompare';

describe('daysBetween', () => {
  it('conta os dias entre as datas', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0);
  });
});

describe('recordAt', () => {
  const rows = [{ d: '2026-01-10', v: 1 }, { d: '2026-02-10', v: 2 }, { d: '2026-03-10', v: 3 }];

  it('pega o registro mais recente em ou antes da data', () => {
    expect(recordAt(rows, 'd', '2026-02-20').v).toBe(2);
    expect(recordAt(rows, 'd', '2026-03-10').v).toBe(3);
  });

  it('sem registro antes, usa o primeiro', () => {
    expect(recordAt(rows, 'd', '2025-12-01').v).toBe(1);
  });

  it('lista vazia devolve null', () => {
    expect(recordAt([], 'd', '2026-01-01')).toBeNull();
    expect(recordAt(null, 'd', '2026-01-01')).toBeNull();
  });
});

describe('buildComparison', () => {
  const before = { photo_date: '2026-01-15' };
  const after = { photo_date: '2026-04-15' };
  const weightLogs = [{ log_date: '2026-01-10', peso: 90 }, { log_date: '2026-04-10', peso: 84.5 }];
  const measurements = [
    { measured_on: '2026-01-12', cintura: 100, quadril: 105, peito: null, braco: 35, coxa: null },
    { measured_on: '2026-04-12', cintura: 92, quadril: 104, peito: 110, braco: 36.5, coxa: null },
  ];

  it('devolve tempo, peso e medidas com a diferença', () => {
    const c = buildComparison({ before, after, weightLogs, measurements });
    expect(c.days).toBe(90);
    expect(c.weight).toEqual({ before: 90, after: 84.5, diff: -5.5 });
    expect(c.measures.map(m => [m.key, m.diff])).toEqual([['cintura', -8], ['quadril', -1], ['braco', 1.5]]);
  });

  it('deixa de fora medida sem valor nas duas pontas', () => {
    const c = buildComparison({ before, after, weightLogs, measurements });
    expect(c.measures.find(m => m.key === 'peito')).toBeUndefined();
    expect(c.measures.find(m => m.key === 'coxa')).toBeUndefined();
  });

  it('com um registro só (mesma referência nas duas fotos) não inventa diferença', () => {
    const c = buildComparison({ before, after, weightLogs: [weightLogs[0]], measurements: [measurements[0]] });
    expect(c.weight).toBeNull();
    expect(c.measures).toEqual([]);
  });

  it('sem peso nem medidas ainda devolve o tempo', () => {
    expect(buildComparison({ before, after })).toEqual({ days: 90, weight: null, measures: [] });
  });

  it('sem uma das fotos devolve null', () => {
    expect(buildComparison({ before: null, after })).toBeNull();
  });
});
