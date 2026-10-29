import { t } from '../lib/i18n';
import { TACO_FOODS } from './tacoFoods';

// Base de alimentos para a busca da aba Nutrição. Valores aproximados por 100 g
// (preparo comum no Brasil, na linha da Tabela TACO), arredondados; `portion`
// é a quantidade em gramas que a busca sugere. Não substitui orientação de
// nutricionista.
// p = proteína (g), k = kcal, c = carboidratos (g), f = gorduras (g).
const RAW = [
  ['🍚', 'Arroz branco cozido', 130, 2.5, 28, 0.2, 150],
  ['🍚', 'Arroz integral cozido', 124, 2.6, 26, 1, 150],
  ['🫘', 'Feijão carioca cozido', 76, 4.8, 14, 0.5, 100],
  ['🫘', 'Feijão preto cozido', 77, 4.5, 14, 0.5, 100],
  ['🫘', 'Lentilha cozida', 93, 6.3, 16, 0.5, 100],
  ['🫛', 'Grão-de-bico cozido', 130, 7, 21, 2, 100],
  ['🍝', 'Macarrão cozido', 135, 4.5, 28, 0.7, 150],
  ['🥔', 'Batata inglesa cozida', 52, 1.2, 12, 0, 150],
  ['🍠', 'Batata-doce cozida', 77, 0.6, 18, 0.1, 150],
  ['🍠', 'Mandioca cozida', 125, 0.6, 30, 0.3, 100],
  ['🌽', 'Cuscuz de milho', 115, 2.2, 25, 0.7, 120],
  ['🫓', 'Tapioca (goma hidratada)', 240, 0, 59, 0, 50],
  ['🥖', 'Pão francês', 300, 8, 58, 3, 50],
  ['🍞', 'Pão de forma integral', 253, 9, 49, 3.5, 50],
  ['🥣', 'Aveia em flocos', 394, 14, 67, 8.5, 30],
  ['🥣', 'Granola', 420, 9, 66, 14, 30],
  ['🌽', 'Milho cozido', 98, 3.2, 21, 1.2, 100],
  ['🍗', 'Peito de frango grelhado', 165, 31, 0, 3.6, 120],
  ['🍗', 'Coxa de frango assada', 215, 26, 0, 12, 100],
  ['🥩', 'Carne bovina (patinho) grelhada', 219, 35, 0, 8, 120],
  ['🥩', 'Carne moída refogada', 212, 26, 0, 12, 100],
  ['🥩', 'Alcatra grelhada', 241, 31, 0, 12, 120],
  ['🥓', 'Carne de porco (lombo) assada', 210, 29, 0, 10, 100],
  ['🐟', 'Tilápia grelhada', 128, 26, 0, 2.7, 120],
  ['🐟', 'Salmão grelhado', 208, 22, 0, 13, 120],
  ['🐟', 'Atum em lata (natural)', 116, 26, 0, 1, 120],
  ['🥚', 'Ovo cozido', 146, 13, 1, 10, 50],
  ['🍳', 'Ovo mexido', 170, 11, 1.6, 13, 100],
  ['🥛', 'Leite integral', 61, 3.2, 4.7, 3.3, 200],
  ['🥛', 'Leite desnatado', 35, 3.4, 5, 0.1, 200],
  ['🥛', 'Iogurte natural', 51, 4.1, 5.2, 1.6, 170],
  ['🥛', 'Iogurte grego natural', 97, 9, 4, 5, 170],
  ['🧀', 'Queijo minas frescal', 264, 17, 3, 20, 40],
  ['🧀', 'Queijo muçarela', 330, 22, 3, 25, 30],
  ['🧀', 'Queijo cottage', 98, 11, 3.4, 4.3, 100],
  ['🧈', 'Requeijão cremoso', 230, 9, 3, 21, 30],
  ['🥤', 'Whey protein (pó)', 400, 80, 8, 6, 30],
  ['🥬', 'Alface', 15, 1.4, 2.9, 0.2, 50],
  ['🥒', 'Tomate', 18, 0.9, 3.9, 0.2, 100],
  ['🥕', 'Cenoura cozida', 35, 0.8, 8, 0.2, 80],
  ['🥦', 'Brócolis cozido', 35, 2.4, 7, 0.4, 100],
  ['🥒', 'Abobrinha cozida', 20, 1.1, 4, 0.2, 100],
  ['🥬', 'Couve refogada', 90, 2.7, 8, 6, 80],
  ['🍌', 'Banana prata', 98, 1.3, 26, 0.1, 100],
  ['🍎', 'Maçã', 56, 0.3, 15, 0.1, 130],
  ['🍊', 'Laranja', 46, 1, 11, 0.1, 150],
  ['🥭', 'Manga', 64, 0.4, 17, 0.3, 150],
  ['🍉', 'Melancia', 33, 0.9, 8, 0, 200],
  ['🍇', 'Uva', 53, 0.7, 14, 0.2, 100],
  ['🍓', 'Morango', 30, 0.9, 7, 0.3, 100],
  ['🍍', 'Abacaxi', 48, 0.9, 12, 0.1, 100],
  ['🍈', 'Mamão', 40, 0.5, 10, 0.1, 150],
  ['🥑', 'Abacate', 160, 2, 8.5, 14.7, 80],
  ['🥜', 'Amendoim', 567, 26, 16, 49, 30],
  ['🥜', 'Pasta de amendoim', 590, 25, 20, 50, 15],
  ['🌰', 'Castanha-do-pará', 656, 14, 12, 66, 15],
  ['🫒', 'Azeite de oliva', 884, 0, 0, 100, 10],
  ['🍫', 'Chocolate ao leite', 540, 7, 59, 30, 25],
  ['🍪', 'Biscoito cream cracker', 432, 10, 69, 14, 30],
  ['☕', 'Café com açúcar', 25, 0.1, 6, 0, 100],
  ['🧃', 'Suco de laranja', 45, 0.7, 10, 0.2, 200],
  ['🥤', 'Refrigerante', 40, 0, 10, 0, 350],
  ['🍕', 'Pizza (muçarela)', 270, 11, 33, 10, 120],
  ['🍔', 'Hambúrguer com pão', 250, 13, 25, 11, 150],
  ['🥟', 'Pastel de carne frito', 340, 10, 30, 20, 80],
];

export const FOOD_DATABASE = RAW.map(([icon, name, kcal, g, carbs, fat, portion], i) => ({
  id: `db${i}`, icon, name: t(name), kcal, g, carbs, fat, portion,
}));

const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Base da busca: os itens acima (nomes simples, traduzidos) e a Tabela TACO completa.
export const ALL_FOODS = [...FOOD_DATABASE, ...TACO_FOODS];

// Todas as palavras digitadas precisam aparecer no nome (sem acento, qualquer
// ordem). Os itens acima vêm antes dos da TACO e, em cada grupo, os que começam
// pela primeira palavra ("feijão" → "Feijão, carioca…" antes de "Acarajé…").
// Item cru vai depois do preparado, a não ser que a busca peça "cru".
export function searchFoods(query, list = ALL_FOODS, limit = 10) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const wantsRaw = words.some(w => w.startsWith('cru'));
  const rank = f => (f.source === 'taco' ? 2 : 0) + (plain(f.name).startsWith(words[0]) ? 0 : 1)
    + (!wantsRaw && /\bcrua?\b/.test(plain(f.name)) ? 0.5 : 0);
  return list
    .filter(f => words.every(w => plain(f.name).includes(w)))
    .map((f, i) => [rank(f), i, f])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, limit)
    .map(([, , f]) => f);
}

// Macros de `grams` gramas de um alimento por 100 g, no formato do registro do dia.
export function portionOf(food, grams) {
  const k = (Number(grams) || 0) / 100;
  return {
    g: Math.round(food.g * k),
    kcal: Math.round(food.kcal * k),
    carbs: Math.round(food.carbs * k),
    fat: Math.round(food.fat * k),
  };
}
