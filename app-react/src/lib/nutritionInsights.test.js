import { describe, it, expect } from 'vitest';
import { buildNutritionSeries, kcalWeekSummary, weightRatePerWeek, nutritionReading } from './nutritionInsights';

const day = (date, kcal) => ({ date, protein: 0, kcal, carbs: 0, fat: 0 });

describe('buildNutritionSeries', () => {
  it('preenche dias sem registro com zero e termina em hoje', () => {
    const s = buildNutritionSeries([{ log_date: '2026-12-09', amount_g: 100, kcal: 2000, carbs_g: 200, fat_g: 60 }], '2026-12-10', 3);
    expect(s.map(d => d.date)).toEqual(['2026-12-08', '2026-12-09', '2026-12-10']);
    expect(s[1]).toEqual({ date: '2026-12-09', protein: 100, kcal: 2000, carbs: 200, fat: 60 });
    expect(s[0].kcal).toBe(0);
  });
});

describe('kcalWeekSummary', () => {
  const series = (kcals, today = 0) => [...kcals.map((k, i) => day(`2026-12-0${i + 1}`, k)), day('2026-12-09', today)];

  it('ignora hoje e os dias sem registro', () => {
    const r = kcalWeekSummary(series([2000, 0, 2200, 1800, 0, 2000, 2000], 5000), 2000);
    expect(r.loggedDays).toBe(5);
    expect(r.avgKcal).toBe(2000);
    expect(r.daysOnTarget).toBe(5);
    expect(r.verdict).toBe('ok');
  });
  it('classifica abaixo e acima da meta', () => {
    expect(kcalWeekSummary(series([1500, 1500, 1500]), 2000).verdict).toBe('low');
    expect(kcalWeekSummary(series([2600, 2600, 2600]), 2000).verdict).toBe('high');
  });
  it('sem veredito com poucos dias registrados', () => {
    const r = kcalWeekSummary(series([2000, 2000]), 2000);
    expect(r.loggedDays).toBe(2);
    expect(r.verdict).toBeNull();
  });
  it('sem meta ou sem registro devolve zeros', () => {
    expect(kcalWeekSummary(series([2000, 2000, 2000]), 0).verdict).toBeNull();
    expect(kcalWeekSummary(series([0, 0]), 2000).loggedDays).toBe(0);
  });
});

describe('weightRatePerWeek', () => {
  const logs = [{ log_date: '2026-11-12', peso: 80 }, { log_date: '2026-12-10', peso: 78 }];
  it('calcula kg por semana no período', () => {
    expect(weightRatePerWeek(logs, '2026-12-10')).toBe(-0.5);
  });
  it('null com poucos registros ou período curto', () => {
    expect(weightRatePerWeek([logs[0]], '2026-12-10')).toBeNull();
    expect(weightRatePerWeek([{ log_date: '2026-12-08', peso: 80 }, { log_date: '2026-12-10', peso: 79 }], '2026-12-10')).toBeNull();
  });
  it('ignora registros fora da janela de 28 dias', () => {
    expect(weightRatePerWeek([{ log_date: '2026-10-01', peso: 90 }, { log_date: '2026-12-10', peso: 78 }], '2026-12-10')).toBeNull();
  });
});

describe('nutritionReading', () => {
  const ok = { verdict: 'ok', loggedDays: 6 };
  it('sem registro não há leitura; com poucos dias avisa', () => {
    expect(nutritionReading({ verdict: null, loggedDays: 0 }, 'massa', null)).toBeNull();
    expect(nutritionReading({ verdict: null, loggedDays: 2 }, 'massa', null)).toBe('few_days');
  });
  it('abaixo da meta depende do objetivo', () => {
    const low = { verdict: 'low', loggedDays: 6 };
    expect(nutritionReading(low, 'massa', null)).toBe('below_gain');
    expect(nutritionReading(low, 'emagrecer', null)).toBe('below_loss');
    expect(nutritionReading(low, 'saude', null)).toBe('below');
  });
  it('acima da meta depende do objetivo', () => {
    const high = { verdict: 'high', loggedDays: 6 };
    expect(nutritionReading(high, 'definicao', null)).toBe('above_loss');
    expect(nutritionReading(high, 'massa', null)).toBe('above_gain');
    expect(nutritionReading(high, 'saude', null)).toBe('above');
  });
  it('na meta: confere se o peso anda na direção esperada', () => {
    expect(nutritionReading(ok, 'emagrecer', -0.4)).toBe('on_track');
    expect(nutritionReading(ok, 'emagrecer', 0.3)).toBe('plateau');
    expect(nutritionReading(ok, 'massa', 0.05)).toBe('plateau');
    expect(nutritionReading(ok, 'emagrecer', null)).toBe('on_track');
    expect(nutritionReading(ok, 'saude', 0.5)).toBe('on_track');
  });
});
