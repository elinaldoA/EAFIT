import { describe, it, expect, vi } from 'vitest';
import { lookupBarcode, isBarcode } from './openFoodFacts';

const reply = body => vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });

describe('openFoodFacts', () => {
  it('valida o formato do código', () => {
    expect(isBarcode('7891000100103')).toBe(true);
    expect(isBarcode('12345')).toBe(false);
    expect(isBarcode('78910001001a3')).toBe(false);
  });

  it('converte o produto para macros por 100 g', async () => {
    const fetchFn = reply({ status: 1, product: { product_name: ' Leite ', serving_quantity: '200', nutriments: { 'energy-kcal_100g': 61, proteins_100g: 3.2, carbohydrates_100g: 4.7, fat_100g: 3.3 } } });
    const food = await lookupBarcode('7891000100103', fetchFn);
    expect(food).toMatchObject({ name: 'Leite', kcal: 61, g: 3.2, carbs: 4.7, fat: 3.3, portion: 200 });
    expect(fetchFn.mock.calls[0][0]).toContain('/7891000100103.json');
  });

  it('usa kJ quando não há kcal', async () => {
    const food = await lookupBarcode('7891000100103', reply({ status: 1, product: { nutriments: { energy_100g: 418.4, proteins_100g: 1 } } }));
    expect(food.kcal).toBe(100);
    expect(food.portion).toBe(100);
  });

  it('produto inexistente ou sem nutrientes devolve null', async () => {
    expect(await lookupBarcode('7891000100103', reply({ status: 0 }))).toBeNull();
    expect(await lookupBarcode('7891000100103', reply({ status: 1, product: { nutriments: {} } }))).toBeNull();
    expect(await lookupBarcode('123', vi.fn())).toBeNull();
  });

  it('erro de rede ou HTTP lança', async () => {
    await expect(lookupBarcode('7891000100103', vi.fn().mockResolvedValue({ ok: false, status: 500 }))).rejects.toThrow();
  });
});
