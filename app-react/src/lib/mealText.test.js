import { describe, it, expect } from 'vitest';
import { parseMealText } from './dietImport';
import { foodsWithCatalog } from '../data/foodDatabase';

describe('parseMealText', () => {
  it('quebra a frase em alimentos e entende quantidades', () => {
    const { items, unknown } = parseMealText('comi 2 ovos cozidos, uma banana e 150 g de arroz branco cozido');
    expect(unknown).toBe(0);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ amount: '100 g', label: 'ovos cozidos 100g' });
    expect(parseMealText('2 ovos mexidos').items[0].amount).toBe('100 g');
    expect(items[0].kcal).toBeGreaterThan(130);
    expect(items[1].amount).toBe('70 g');
    expect(items[2]).toMatchObject({ amount: '150 g' });
    expect(items[2].kcal).toBe(192);
  });

  it('número por extenso, meio e separadores diferentes', () => {
    const { items } = parseMealText('duas fatias de pão de forma integral; meia banana\n200 g de iogurte natural');
    expect(items).toHaveLength(3);
    expect(items[1].amount).toBe('35 g');
    expect(items[2].amount).toBe('200 g');
  });

  it('o que não acha vem como desconhecido e não soma', () => {
    const { items, unknown } = parseMealText('1 banana, 3 gnomos fritos');
    expect(unknown).toBe(1);
    expect(items.find(i => i.unknown).label).toMatch(/gnomos/);
  });

  it('usa o catálogo do painel e aceita plural', () => {
    const foods = foodsWithCatalog([{ id: 'p1', name: 'Pamonha de queijo', active: true, portion_g: 120, kcal: 210, protein_g: 5, carbs_g: 30, fat_g: 8 }]);
    const { items } = parseMealText('2 pamonhas de queijo', { foods });
    expect(items[0]).toMatchObject({ amount: '240 g', kcal: 504 });
  });

  it('texto vazio ou sem nada útil', () => {
    expect(parseMealText('').items).toEqual([]);
    expect(parseMealText('   ,  ; ').items).toEqual([]);
  });
});
