import { describe, it, expect } from 'vitest';
import { expectedShare, dayPace, suggestFoods, portionFood, mealHabit, proteinSpread, suggestedKcal } from './nutritionCoach';

const goals = { protein: 140, kcal: 2500, carbs: 300, fat: 70 };
const tot = (protein, kcal) => ({ protein, kcal, carbs: 0, fat: 0 });

describe('expectedShare', () => {
  it('segue as refeições do dia', () => {
    expect(expectedShare(6)).toBe(0);
    expect(expectedShare(10)).toBe(0.25);
    expect(expectedShare(12)).toBeCloseTo(0.4);
    expect(expectedShare(23)).toBe(1);
  });
});

describe('dayPace', () => {
  it('sem meta não tem ritmo', () => {
    expect(dayPace(tot(0, 0), null, 12)).toBeNull();
  });

  it('atrás do ritmo quando falta bem mais que o esperado para a hora', () => {
    const p = dayPace(tot(20, 600), goals, 14);
    expect(p.status).toBe('behind');
    expect(p.expectedG).toBe(77);
    expect(p.behindG).toBe(57);
  });

  it('no ritmo dentro da margem', () => {
    expect(dayPace(tot(70, 1200), goals, 14).status).toBe('on_track');
  });

  it('meta batida, calorias estouradas e fim de dia', () => {
    expect(dayPace(tot(150, 2000), goals, 15).status).toBe('done');
    expect(dayPace(tot(150, 2900), goals, 15).status).toBe('over_kcal');
    expect(dayPace(tot(60, 1500), goals, 20.5).status).toBe('late');
  });

  it('calcula o que falta', () => {
    expect(dayPace(tot(100, 2000), goals, 18).left).toEqual({ protein: 40, kcal: 500 });
  });
});

const ovo = { id: 'ovo', label: 'Ovo', g: 6, kcal: 70, carbs: 1, fat: 5 };
const frango = { id: 'frango', label: 'Frango', g: 31, kcal: 165, carbs: 0, fat: 4 };
const whey = { id: 'whey', label: 'Whey', g: 24, kcal: 120, carbs: 3, fat: 2 };
const arroz = { id: 'arroz', label: 'Arroz', g: 3, kcal: 130, carbs: 28, fat: 0 };
const queijo = { id: 'queijo', label: 'Queijo', g: 10, kcal: 130, carbs: 1, fat: 10 };

describe('suggestFoods', () => {
  it('prefere o que cobre a proteína com menos calorias e ignora o que quase não tem proteína', () => {
    const s = suggestFoods([arroz, ovo, frango, whey, queijo], { protein: 30, kcal: 600 });
    expect(s[0].food.id).toBe('frango');
    expect(s.map(x => x.food.id)).not.toContain('arroz');
  });

  it('ajusta as porções às calorias que sobram', () => {
    const [s] = suggestFoods([frango], { protein: 90, kcal: 400 });
    expect(s.n).toBe(2);
    expect(s.kcal).toBe(330);
  });

  it('sem calorias sobrando só sugere o que é quase só proteína', () => {
    const s = suggestFoods([queijo, whey, frango], { protein: 20, kcal: -50 });
    expect(s.map(x => x.food.id)).toEqual(['whey', 'frango']);
    expect(s.every(x => x.n === 1)).toBe(true);
  });

  it('nada a sugerir com a proteína batida', () => {
    expect(suggestFoods([frango], { protein: 0, kcal: 500 })).toEqual([]);
  });
});

describe('portionFood', () => {
  it('multiplica os macros e marca as porções no nome', () => {
    expect(portionFood({ food: ovo, n: 2 })).toMatchObject({ label: '2× Ovo', g: 12, kcal: 140, carbs: 2, fat: 10 });
    expect(portionFood({ food: ovo, n: 1 }).label).toBe('Ovo');
  });
});

const row = (log_date, name, meal = 'cafe') => ({ log_date, meal, name, icon: '🍽️', protein_g: 6, kcal: 70, carbs_g: 1, fat_g: 5 });

describe('mealHabit', () => {
  const today = '2026-10-29';

  it('acha o que se repete na refeição e ignora o que foi uma vez', () => {
    const rows = [
      row('2026-10-26', 'Ovo'), row('2026-10-26', 'Pão'),
      row('2026-10-27', 'Ovo'), row('2026-10-27', 'Café c/ leite'),
      row('2026-10-28', 'ovo '), row('2026-10-28', 'Pão'),
      row('2026-10-28', 'Frango', 'almoco'), row('2026-10-27', 'Frango', 'almoco'),
    ];
    const h = mealHabit(rows, 'cafe', today);
    expect(h.kind).toBe('usual');
    expect(h.items.map(i => i.label)).toEqual(['ovo ', 'Pão']);
  });

  it('tira o que já foi lançado hoje', () => {
    const rows = [row('2026-10-27', 'Ovo'), row('2026-10-28', 'Ovo'), row('2026-10-27', 'Pão'), row('2026-10-28', 'Pão')];
    const h = mealHabit(rows, 'cafe', today, [{ meal: 'cafe', label: 'Ovo' }]);
    expect(h.items.map(i => i.label)).toEqual(['Pão']);
  });

  it('sem hábito, oferece repetir a refeição mais recente se for de poucos dias atrás', () => {
    expect(mealHabit([row('2026-10-27', 'Tapioca')], 'cafe', today)).toMatchObject({ kind: 'last', date: '2026-10-27' });
    expect(mealHabit([row('2026-10-20', 'Tapioca')], 'cafe', today)).toBeNull();
    expect(mealHabit([], 'cafe', today)).toBeNull();
  });

  it('não conta o dia de hoje como histórico', () => {
    expect(mealHabit([row(today, 'Ovo')], 'cafe', today)).toBeNull();
  });
});

describe('proteinSpread', () => {
  it('avisa quando uma refeição concentra a proteína do dia', () => {
    const e = [{ meal: 'jantar', g: 60 }, { meal: 'cafe', g: 10 }];
    expect(proteinSpread(e)).toEqual({ meal: 'jantar', share: 86 });
  });

  it('não avisa com pouca proteína ou bem distribuída', () => {
    expect(proteinSpread([{ meal: 'jantar', g: 30 }])).toBeNull();
    expect(proteinSpread([{ meal: 'jantar', g: 40 }, { meal: 'almoco', g: 40 }])).toBeNull();
  });
});

describe('suggestedKcal', () => {
  it('ajusta 7% na direção do objetivo quando o peso empaca', () => {
    expect(suggestedKcal(2500, 'plateau', 'emagrecer')).toBe(2330);
    expect(suggestedKcal(2500, 'plateau', 'massa')).toBe(2680);
    expect(suggestedKcal(2500, 'on_track', 'massa')).toBeNull();
    expect(suggestedKcal(2500, 'plateau', 'saude')).toBeNull();
  });
});
