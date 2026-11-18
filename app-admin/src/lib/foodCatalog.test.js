import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
import { EMPTY_FOOD, parseMeasures, measuresToText, toDraft, validateFood, filterFoods, friendlyFoodError } from './foodCatalog';

const valid = (over = {}) => ({ ...EMPTY_FOOD, name: 'Pamonha', kcal: '200', protein_g: '5', carbs_g: '30', fat_g: '7', ...over });

describe('foodCatalog', () => {
  it('medidas caseiras: texto <-> lista', () => {
    expect(parseMeasures('fatia=30; copo = 200,5')).toEqual([{ label: 'fatia', grams: 30 }, { label: 'copo', grams: 200.5 }]);
    expect(measuresToText([{ label: 'fatia', grams: 30 }])).toBe('fatia=30');
    expect(parseMeasures('')).toEqual([]);
  });

  it('valida e converte para o formato da tabela', () => {
    const { ok, value } = validateFood(valid({ category: ' Pratos ', measures: 'unidade=120', estimated: true, kcal: '212,5' }));
    expect(ok).toBe(true);
    expect(value).toMatchObject({ name: 'Pamonha', category: 'Pratos', kcal: 212.5, protein_g: 5, estimated: true, active: true, measures: [{ label: 'unidade', grams: 120 }] });
  });

  it('recusa nome vazio, números fora da faixa, medida inválida e calorias que não batem', () => {
    expect(validateFood(valid({ name: ' ' })).errors.name).toBeTruthy();
    expect(validateFood(valid({ kcal: '' })).errors.kcal).toBeTruthy();
    expect(validateFood(valid({ protein_g: '150' })).errors.protein_g).toBeTruthy();
    expect(validateFood(valid({ portion_g: '0' })).errors.portion_g).toBeTruthy();
    expect(validateFood(valid({ measures: 'fatia' })).errors.measures).toBeTruthy();
    expect(validateFood(valid({ measures: 'a=1;b=1;c=1;d=1;e=1;f=1;g=1' })).errors.measures).toBeTruthy();
    expect(validateFood(valid({ kcal: '600' })).errors.kcal).toMatch(/Não bate/);
  });

  it('toDraft traz a linha para o formulário', () => {
    const d = toDraft({ name: 'X', kcal: 10, estimated: true, measures: [{ label: 'copo', grams: 200 }], category: null });
    expect(d).toMatchObject({ name: 'X', kcal: '10', estimated: true, measures: 'copo=200', category: '' });
  });

  it('filtra por texto e situação', () => {
    const rows = [{ name: 'A', active: true, estimated: false }, { name: 'B', category: 'Doces', active: false, estimated: true }];
    expect(filterFoods(rows, { search: 'doces' }).map(r => r.name)).toEqual(['B']);
    expect(filterFoods(rows, { status: 'ativos' }).map(r => r.name)).toEqual(['A']);
    expect(filterFoods(rows, { status: 'estimados' }).map(r => r.name)).toEqual(['B']);
  });

  it('mensagens de erro amigáveis', () => {
    expect(friendlyFoodError({ code: '23505' })).toMatch(/Já existe/);
    expect(friendlyFoodError({ code: '42P01' })).toMatch(/migration/);
  });

  it('açúcares e gordura saturada são opcionais', () => {
    const base = { ...EMPTY_FOOD, name: 'X', kcal: '100', protein_g: '5', carbs_g: '15', fat_g: '2' };
    expect(validateFood(base).value).toMatchObject({ sugar_g: null, sat_fat_g: null });
    expect(validateFood({ ...base, sugar_g: '4,5', sat_fat_g: '1' }).value).toMatchObject({ sugar_g: 4.5, sat_fat_g: 1 });
    expect(validateFood({ ...base, sugar_g: '120' }).errors.sugar_g).toBeTruthy();
  });

  it('nome em inglês é opcional', () => {
    const base = { ...EMPTY_FOOD, name: 'X', kcal: '100', protein_g: '5', carbs_g: '15', fat_g: '2' };
    expect(validateFood(base).value.name_en).toBeNull();
    expect(validateFood({ ...base, name_en: ' Rice ' }).value.name_en).toBe('Rice');
    expect(validateFood({ ...base, name_en: 'x'.repeat(61) }).errors.name_en).toBeTruthy();
  });
});
