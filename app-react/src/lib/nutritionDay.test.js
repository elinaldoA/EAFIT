import { describe, it, expect } from 'vitest';
import { unloggedRest, dayMicros, recentDays, HISTORY_DAYS } from './nutritionDay';

describe('unloggedRest', () => {
  it('é o que está nos totais e não está no diário', () => {
    const entries = [{ kcal: 300, g: 20 }, { kcal: 200, g: 10 }];
    expect(unloggedRest(entries, { kcal: 800, protein: 50 })).toEqual({ kcal: 300, protein: 20 });
  });

  it('tudo detalhado ou diário maior que os totais: null', () => {
    expect(unloggedRest([{ kcal: 500, g: 30 }], { kcal: 500, protein: 30 })).toBeNull();
    expect(unloggedRest([{ kcal: 900, g: 60 }], { kcal: 500, protein: 30 })).toBeNull();
    expect(unloggedRest([], { kcal: 0, protein: 0 })).toBeNull();
  });

  it('sobra só de calorias ou só de proteína também conta', () => {
    expect(unloggedRest([{ kcal: 100, g: 30 }], { kcal: 400, protein: 30 })).toEqual({ kcal: 300, protein: 0 });
    expect(unloggedRest([{ kcal: 400, g: 10 }], { kcal: 400, protein: 30 })).toEqual({ kcal: 0, protein: 20 });
  });
});

describe('dayMicros', () => {
  it('soma fibra e sódio só dos registros que trazem o dado', () => {
    const entries = [{ fiber: 2.25, sodium: 100.4 }, { fiber: 1.5 }, { label: 'sem dado' }];
    expect(dayMicros(entries)).toEqual({ fiber: 3.8, sodium: 100, partial: true });
  });

  it('todos com dado: não é parcial; nenhum com dado: null', () => {
    expect(dayMicros([{ fiber: 1, sodium: 50 }, { fiber: 2, sodium: 70 }])).toMatchObject({ fiber: 3, sodium: 120, partial: false });
    expect(dayMicros([{ label: 'a' }])).toBeNull();
    expect(dayMicros([])).toBeNull();
  });
});

describe('recentDays', () => {
  it('começa em hoje e anda para trás, atravessando o mês e o ano', () => {
    expect(recentDays('2027-01-02', 4)).toEqual(['2027-01-02', '2027-01-01', '2026-12-31', '2026-12-30']);
  });

  it('o padrão é a janela de histórico da aba', () => {
    expect(recentDays('2026-11-16')).toHaveLength(HISTORY_DAYS);
  });
});
