import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { parseMeasure, measurementDeltas } from './bodyMeasurements';

describe('parseMeasure', () => {
  it('aceita vírgula e arredonda a 1 casa', () => {
    expect(parseMeasure('82,5')).toBe(82.5);
    expect(parseMeasure('82.34')).toBe(82.3);
    expect(parseMeasure(90)).toBe(90);
  });
  it('vazio, texto e não positivo viram null', () => {
    expect(parseMeasure('')).toBeNull();
    expect(parseMeasure('  ')).toBeNull();
    expect(parseMeasure('abc')).toBeNull();
    expect(parseMeasure('0')).toBeNull();
    expect(parseMeasure('-3')).toBeNull();
    expect(parseMeasure(null)).toBeNull();
  });
});

describe('measurementDeltas', () => {
  it('compara último com primeiro registro de cada campo', () => {
    const rows = [
      { measured_on: '2026-09-01', cintura: 90, braco: null },
      { measured_on: '2026-09-15', cintura: 88, braco: 35 },
      { measured_on: '2026-10-01', cintura: 86.5, braco: null },
    ];
    const d = measurementDeltas(rows);
    expect(d.cintura).toEqual({ first: 90, last: 86.5, diff: -3.5 });
    expect(d.braco).toBeUndefined(); // só 1 valor
    expect(d.coxa).toBeUndefined();
  });
});
