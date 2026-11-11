import { describe, it, expect } from 'vitest';
import { weekOfCycle, isDeloadWeek, periodizationInfo, deloadSeries, applyPeriodization } from './periodization';

const d = (y, m, day) => new Date(y, m - 1, day);

describe('periodization', () => {
  it('conta a semana do ciclo a partir do início', () => {
    expect(weekOfCycle('2027-01-04', d(2027, 1, 4))).toBe(1);
    expect(weekOfCycle('2027-01-04', d(2027, 1, 10))).toBe(1);
    expect(weekOfCycle('2027-01-04', d(2027, 1, 11))).toBe(2);
    expect(weekOfCycle('2027-01-04', d(2027, 1, 25))).toBe(4);
    expect(weekOfCycle(null)).toBeNull();
  });
  it('semana leve a cada N semanas', () => {
    expect(isDeloadWeek(4, 4)).toBe(true);
    expect(isDeloadWeek(3, 4)).toBe(false);
    expect(isDeloadWeek(8, 4)).toBe(true);
    expect(isDeloadWeek(4, null)).toBe(false);
  });
  it('sem passo nem deload não há periodização', () => {
    expect(periodizationInfo({ startDate: '2027-01-04' }, d(2027, 1, 5))).toBeNull();
    expect(periodizationInfo({ step: 2.5 }, d(2027, 1, 5))).toBeNull();
  });
  it('resume a semana atual', () => {
    const info = periodizationInfo({ startDate: '2027-01-04', durationWeeks: 8, step: 2.5, deloadEvery: 4 }, d(2027, 1, 26));
    expect(info).toMatchObject({ week: 4, total: 8, step: 2.5, deload: true });
  });
  it('reduz as séries só na semana leve', () => {
    expect(deloadSeries('4')).toBe('3');
    expect(deloadSeries('3')).toBe('2');
    expect(deloadSeries('1')).toBe('1');
    const days = [{ dia: 'Segunda', exercicios: [{ nome: 'A', series: '4' }, { nome: 'B', series: '1' }], pos: [{ nome: 'C', series: '3' }] }];
    expect(applyPeriodization(days, { deload: false })).toBe(days);
    const out = applyPeriodization(days, { deload: true });
    expect(out[0].exercicios[0]).toMatchObject({ series: '3', seriesPlanned: '4', deload: true });
    expect(out[0].exercicios[1].series).toBe('1');
    expect(out[0].pos[0].series).toBe('3');
  });
});
