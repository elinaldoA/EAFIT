import { describe, it, expect } from 'vitest';
import { calcStreak } from './utils';

const TODAY = '2026-10-10';

describe('calcStreak sem pausas (comportamento original)', () => {
  it('sem treinos é zero', () => {
    expect(calcStreak([], [], TODAY)).toBe(0);
  });

  it('conta dias seguidos até hoje ou ontem', () => {
    expect(calcStreak(['2026-10-10', '2026-10-09', '2026-10-08'], [], TODAY)).toBe(3);
    expect(calcStreak(['2026-10-09', '2026-10-08'], [], TODAY)).toBe(2);
  });

  it('um dia sem treinar quebra a sequência', () => {
    expect(calcStreak(['2026-10-10', '2026-10-08'], [], TODAY)).toBe(1);
    expect(calcStreak(['2026-10-07', '2026-10-06'], [], TODAY)).toBe(0);
  });

  it('ignora datas repetidas', () => {
    expect(calcStreak(['2026-10-10', '2026-10-10', '2026-10-09'], [], TODAY)).toBe(2);
  });
});

describe('calcStreak com modo pausa', () => {
  it('a pausa no meio não quebra a sequência nem soma a ela', () => {
    // treinou 1, 2, 3; pausa 4..7; treinou 8, 9, 10
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-08', '2026-10-09', '2026-10-10'];
    expect(calcStreak(dates, [{ from: '2026-10-04', to: '2026-10-07' }], TODAY)).toBe(6);
    expect(calcStreak(dates, [], TODAY)).toBe(3);
  });

  it('pausa em andamento até hoje congela a sequência anterior', () => {
    // treinou 1, 2, 3 e está pausado desde o dia 4 até depois de hoje
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
    expect(calcStreak(dates, [{ from: '2026-10-04', to: '2026-10-20' }], TODAY)).toBe(3);
  });

  it('pausa que não cobre todos os dias de falta não ajuda', () => {
    const dates = ['2026-10-01', '2026-10-08', '2026-10-09', '2026-10-10'];
    expect(calcStreak(dates, [{ from: '2026-10-04', to: '2026-10-07' }], TODAY)).toBe(3);
  });

  it('pausa antiga e longe da sequência não interfere', () => {
    const dates = ['2026-10-10', '2026-10-09'];
    expect(calcStreak(dates, [{ from: '2026-08-01', to: '2026-08-10' }], TODAY)).toBe(2);
  });
});
