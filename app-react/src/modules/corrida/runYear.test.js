import { describe, it, expect } from 'vitest';
import { yearRecap, recapYear } from './runYear';

const r = (date, km, sec = km * 360, extra = {}) => ({ run_date: date, started_at: `${date}T08:00:00`, distance_m: km * 1000, duration_s: sec, ...extra });

describe('retrospectiva do ano', () => {
  const runs = [
    r('2026-03-07', 10, 3000, { elev_gain_m: 80, splits: [300, 300, 300, 300, 300, 300, 300, 300, 300, 300] }),
    r('2026-03-14', 21),
    r('2026-03-21', 5),
    r('2026-05-02', 8),
    r('2025-12-01', 30),
  ];

  it('somas, mês mais forte e maior corrida', () => {
    const rec = yearRecap(runs, '2026');
    expect(rec.count).toBe(4);
    expect(rec.meters).toBe(44000);
    expect(rec.bestMonth).toEqual({ month: 3, meters: 36000 });
    expect(rec.months[4]).toBe(8000);
    expect(rec.longest).toEqual({ meters: 21000, date: '2026-03-14' });
    expect(rec.elevM).toBe(80);
    expect(rec.effort5).toBe(1500);
  });
  it('dia favorito, horário e sequência de semanas', () => {
    const rec = yearRecap(runs, '2026');
    expect(rec.weekday).toBe(6); // 4 sábados
    expect(rec.weekdayCount).toBe(4);
    expect(rec.daypart).toBe('manha');
    expect(rec.streak).toBe(3); // 7, 14 e 21 de março
    expect(rec.days).toBe(4);
  });
  it('compara com o ano anterior', () => {
    expect(yearRecap(runs, '2026').vsPrev).toBe(47); // 44 km contra 30 km
    expect(yearRecap(runs, '2025').vsPrev).toBeNull();
  });
  it('sem corrida no ano não há retrospectiva', () => {
    expect(yearRecap(runs, '2024')).toBeNull();
  });
  it('o ano da retrospectiva é o de hoje, ou o último com corrida em janeiro sem corrida', () => {
    expect(recapYear(runs, '2026-11-20')).toBe('2026');
    expect(recapYear([r('2025-12-01', 5)], '2026-01-03')).toBe('2025');
    expect(recapYear([], '2026-01-03')).toBeNull();
  });
});
