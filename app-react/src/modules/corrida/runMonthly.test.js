import { describe, it, expect } from 'vitest';
import { monthBadges, monthlyBadges } from './runMonthly';

const r = (date, km) => ({ run_date: date, distance_m: km * 1000, duration_s: km * 360 });

describe('selos mensais', () => {
  it('km, corridas e corrida longa do mês, com progresso', () => {
    const list = [r('2026-11-02', 12), r('2026-11-05', 30), r('2026-11-09', 21)];
    const b = Object.fromEntries(monthBadges(list).map(x => [x.id, x]));
    expect(b['km-50'].unlocked).toBe(true); // 63 km
    expect(b['km-100'].unlocked).toBe(false);
    expect(Math.round(b['km-100'].progress * 100)).toBe(63);
    expect(b['long-21'].unlocked).toBe(true);
    expect(b['count-8'].have).toBe(3);
  });
  it('o mês atual zera no dia 1 e a estante guarda os meses fechados', () => {
    const runs = [r('2026-10-02', 60), r('2026-10-15', 50), r('2026-09-10', 5), r('2026-11-03', 5)];
    const { current, shelf } = monthlyBadges(runs, '2026-11-10');
    expect(current.filter(b => b.unlocked)).toEqual([]);
    expect(shelf.map(m => m.month)).toEqual(['2026-10']); // setembro não tem selo; novembro ainda não fechou
    expect(shelf[0].badges.map(b => b.id)).toEqual(expect.arrayContaining(['km-100', 'long-10']));
  });
  it('ignora corridas depois de hoje e respeita o limite de meses', () => {
    const runs = [r('2026-12-01', 200)];
    expect(monthlyBadges(runs, '2026-11-10').current.every(b => !b.unlocked)).toBe(true);
    const many = Array.from({ length: 5 }, (_, i) => r(`2026-0${i + 1}-10`, 60));
    expect(monthlyBadges(many, '2026-11-10', 2).shelf).toHaveLength(2);
  });
});
