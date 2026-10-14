import { describe, it, expect } from 'vitest';
import { easterSunday, getHolidays } from './holidays';

describe('easterSunday', () => {
  it('calcula a Páscoa', () => {
    expect(easterSunday(2024).toDateString()).toBe(new Date(2024, 2, 31).toDateString());
    expect(easterSunday(2025).toDateString()).toBe(new Date(2025, 3, 20).toDateString());
    expect(easterSunday(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
  });
});

describe('getHolidays', () => {
  it('Brasil: fixos e móveis (2026)', () => {
    const h = getHolidays(2026, 'pt');
    expect(h.has('2026-01-01')).toBe(true);
    expect(h.has('2026-02-17')).toBe(true); // Carnaval (terça)
    expect(h.has('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(h.has('2026-04-21')).toBe(true);
    expect(h.has('2026-06-04')).toBe(true); // Corpus Christi
    expect(h.has('2026-11-20')).toBe(true); // Consciência Negra
    expect(h.has('2026-03-10')).toBe(false);
  });

  it('Consciência Negra só vale a partir de 2024', () => {
    expect(getHolidays(2023, 'pt').has('2023-11-20')).toBe(false);
  });

  it('EUA: feriados por dia da semana (2026)', () => {
    const h = getHolidays(2026, 'en');
    expect(h.has('2026-01-19')).toBe(true); // MLK
    expect(h.has('2026-05-25')).toBe(true); // Memorial Day
    expect(h.has('2026-09-07')).toBe(true); // Labor Day
    expect(h.has('2026-11-26')).toBe(true); // Thanksgiving
  });
});
