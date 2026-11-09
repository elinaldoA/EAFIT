import { describe, it, expect } from 'vitest';
import { parseDiet, cleanMeals, sumItems } from './dietImport';

describe('parseDiet', () => {
  it('lê refeições e itens com macros escritos', () => {
    const { meals } = parseDiet('Café da manhã (7h)\n- 2 ovos mexidos - 150 kcal - 12g prot - 1g carbo - 10g gord\n\nAlmoço:\n* Arroz 150g | 195 kcal | prot: 4 | carb: 42 | gord: 0');
    expect(meals.map(m => [m.meal, m.name])).toEqual([['cafe', 'Café da manhã'], ['almoco', 'Almoço']]);
    expect(meals[0].items[0]).toMatchObject({ label: '2 ovos mexidos', kcal: 150, g: 12, carbs: 1, fat: 10 });
    expect(meals[1].items[0]).toMatchObject({ label: 'Arroz', kcal: 195, g: 4, carbs: 42, fat: 0, amount: '150 g' });
  });

  it('calcula pela TACO quando o item vem só com a quantidade', () => {
    const { meals } = parseDiet('Almoço\n150g arroz branco cozido\n120g peito de frango grelhado');
    const [arroz, frango] = meals[0].items;
    expect(arroz.estimated).toBe(true);
    expect(arroz.kcal).toBeGreaterThan(150);
    expect(frango.g).toBeGreaterThan(25);
    expect(sumItems(meals[0].items).kcal).toBeGreaterThan(300);
  });

  it('usa a porção sugerida pela contagem ("2 ovos")', () => {
    const { meals } = parseDiet('Lanche\n2 ovo cozido');
    expect(meals[0].items[0].amount).toBe('100 g');
  });

  it('marca como desconhecido o que não acha e não tem macros', () => {
    const { meals } = parseDiet('Jantar\nxyzzy qualquer');
    expect(meals[0].items[0]).toMatchObject({ unknown: true, kcal: 0 });
  });

  it('item antes de qualquer cabeçalho vai para "Dieta"', () => {
    const { meals } = parseDiet('100g de aveia em flocos');
    expect(meals[0]).toMatchObject({ meal: 'outro', name: 'Dieta' });
  });

  it('pré e pós-treino viram lanche; linha com kcal não é cabeçalho', () => {
    const { meals } = parseDiet('Pré-treino\nBanana 90 kcal\nLanche da tarde 200 kcal');
    expect(meals[0].meal).toBe('lanche');
    expect(meals[0].items).toHaveLength(2);
  });

  it('lê CSV com cabeçalho', () => {
    const { meals } = parseDiet('Refeição;Alimento;Quantidade;Kcal;Proteína;Carbo;Gordura\nAlmoço;Arroz;150;195;4;42;0\nAlmoço;Feijão;100;77;5;14;0');
    expect(meals).toHaveLength(1);
    expect(meals[0].items.map(i => i.kcal)).toEqual([195, 77]);
  });

  it('texto vazio ou sem alimentos não gera refeições', () => {
    expect(parseDiet('').meals).toEqual([]);
    expect(parseDiet('Almoço').meals).toEqual([]);
  });

  it('limita refeições e itens', () => {
    const many = Array.from({ length: 15 }, (_, i) => `Refeição ${i}\n10 kcal item${i}`).join('\n');
    expect(parseDiet(many).meals.length).toBeLessThanOrEqual(12);
    expect(parseDiet(many).truncated).toBe(true);
  });
});

describe('cleanMeals', () => {
  it('guarda só os campos conhecidos, em números inteiros', () => {
    const out = cleanMeals([{ meal: 'cafe', name: 'Café', extra: 1, items: [{ label: 'Ovo', g: 6.4, kcal: -3, carbs: 'x', fat: 5, estimated: true, amount: '50 g' }] }, { meal: 'x', name: 'v', items: [] }]);
    expect(out).toEqual([{ meal: 'cafe', name: 'Café', items: [{ label: 'Ovo', icon: '🍽️', g: 6, kcal: 0, carbs: 0, fat: 5, amount: '50 g' }] }]);
  });
});
