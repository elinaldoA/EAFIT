import { t } from '../lib/i18n';
import { TACO_FOODS } from './tacoFoods';

// Base de alimentos para a busca da aba Nutrição, por 100 g; `portion` é a
// quantidade em gramas que a busca sugere. Não substitui orientação de
// nutricionista.
//
// Cada linha: [ícone, nome, porção, origem]. A origem diz de onde saem os valores:
// - nome da TACO: os valores vêm da tabela, sem número copiado à mão;
// - [[nome da TACO, gramas], ...]: prato montado, calculado pelos ingredientes;
// - [kcal, proteína, carbo, gordura, fibra, sódio]: item que a TACO não tem
//   (valores do USDA FoodData Central ou do rótulo comum do produto).
const RAW = [
  ['🍚', 'Arroz branco cozido', 150, 'Arroz, tipo 1, cozido'],
  ['🍚', 'Arroz integral cozido', 150, 'Arroz, integral, cozido'],
  ['🫘', 'Feijão carioca cozido', 140, 'Feijão, carioca, cozido'],
  ['🫘', 'Feijão preto cozido', 140, 'Feijão, preto, cozido'],
  ['🫘', 'Lentilha cozida', 100, 'Lentilha, cozida'],
  ['🫛', 'Grão-de-bico cozido', 100, [164, 8.9, 27.4, 2.6, 7.6, 7]],
  ['🍝', 'Macarrão cozido', 150, [158, 5.8, 30.9, 0.9, 1.8, 1]],
  ['🥔', 'Batata inglesa cozida', 150, 'Batata, inglesa, cozida'],
  ['🍠', 'Batata-doce cozida', 150, 'Batata, doce, cozida'],
  ['🍠', 'Mandioca cozida', 100, 'Mandioca, cozida'],
  ['🌽', 'Cuscuz de milho', 120, 'Cuscuz, de milho, cozido com sal'],
  ['🫓', 'Tapioca (goma hidratada)', 50, [240, 0, 59, 0, 0, 0]],
  ['🥞', 'Crepioca', 70, [['Ovo, de galinha, inteiro, cru', 50], ['Fécula, de mandioca', 20]]],
  ['🥖', 'Pão francês', 50, 'Pão, trigo, francês'],
  ['🍞', 'Pão de forma integral', 50, 'Pão, trigo, forma, integral'],
  ['🧀', 'Pão de queijo', 40, 'Pão, de queijo, assado'],
  ['🥣', 'Aveia em flocos', 30, 'Aveia, flocos, crua'],
  ['🥣', 'Granola', 30, [420, 9, 66, 14, 7, 30]],
  ['🌽', 'Milho cozido', 100, [96, 3.4, 21, 1.5, 2.4, 1]],
  ['🍗', 'Peito de frango grelhado', 120, 'Frango, peito, sem pele, grelhado'],
  ['🍗', 'Frango desfiado (peito cozido)', 100, 'Frango, peito, sem pele, cozido'],
  ['🍗', 'Coxa de frango assada', 100, 'Frango, coxa, com pele, assada'],
  ['🥩', 'Carne bovina (patinho) grelhada', 120, 'Carne, bovina, patinho, sem gordura, grelhado'],
  ['🥩', 'Carne moída refogada', 100, 'Carne, bovina, acém, moído, cozido'],
  ['🥩', 'Alcatra grelhada', 120, [241, 31, 0, 12, 0, 60]],
  ['🥓', 'Carne de porco (lombo) assada', 100, 'Porco, lombo, assado'],
  ['🐟', 'Tilápia grelhada', 120, [128, 26.2, 0, 2.7, 0, 56]],
  ['🐟', 'Salmão grelhado', 120, 'Salmão, sem pele, fresco, grelhado'],
  ['🐟', 'Atum em lata (natural)', 120, [116, 25.5, 0, 0.8, 0, 247]],
  ['🐟', 'Sardinha em lata (óleo)', 84, 'Sardinha, conserva em óleo'],
  ['🥚', 'Ovo cozido', 50, 'Ovo, de galinha, inteiro, cozido/10minutos'],
  ['🍳', 'Ovo frito', 50, 'Ovo, de galinha, inteiro, frito'],
  ['🍳', 'Ovo mexido', 100, [149, 10, 1.6, 11, 0, 145]],
  ['🥛', 'Leite integral', 200, [61, 3.2, 4.8, 3.3, 0, 43]],
  ['🥛', 'Leite desnatado', 200, [34, 3.4, 5, 0.1, 0, 42]],
  ['🥛', 'Iogurte natural', 170, 'Iogurte, natural'],
  ['🥛', 'Iogurte grego natural', 170, [97, 9, 4, 5, 0, 35]],
  ['🧀', 'Queijo minas frescal', 30, 'Queijo, minas, frescal'],
  ['🧀', 'Queijo muçarela', 30, 'Queijo, mozarela'],
  ['🧀', 'Queijo cottage', 100, [98, 11.1, 3.4, 4.3, 0, 364]],
  ['🧈', 'Requeijão cremoso', 30, 'Queijo, requeijão, cremoso'],
  ['🧈', 'Manteiga', 10, 'Manteiga, com sal'],
  ['🥤', 'Whey protein (pó)', 30, [400, 80, 8, 6, 0, 250]],
  ['🌱', 'Tofu', 100, [76, 8.1, 1.9, 4.8, 0.3, 7]],
  ['🥬', 'Alface', 30, 'Alface, crespa, crua'],
  ['🍅', 'Tomate', 100, 'Tomate, com semente, cru'],
  ['🥕', 'Cenoura cozida', 80, 'Cenoura, cozida'],
  ['🥦', 'Brócolis cozido', 100, 'Brócolis, cozido'],
  ['🥒', 'Abobrinha cozida', 100, 'Abobrinha, italiana, cozida'],
  ['🥬', 'Couve refogada', 80, 'Couve, manteiga, refogada'],
  ['🍌', 'Banana prata', 70, 'Banana, prata, crua'],
  ['🍎', 'Maçã', 130, 'Maçã, Fuji, com casca, crua'],
  ['🍊', 'Laranja', 140, 'Laranja, pêra, crua'],
  ['🥭', 'Manga', 150, 'Manga, Tommy Atkins, crua'],
  ['🍉', 'Melancia', 200, 'Melancia, crua'],
  ['🍇', 'Uva', 100, 'Uva, Itália, crua'],
  ['🍓', 'Morango', 100, 'Morango, cru'],
  ['🍍', 'Abacaxi', 100, 'Abacaxi, cru'],
  ['🍈', 'Mamão', 150, 'Mamão, Papaia, cru'],
  ['🥑', 'Abacate', 80, 'Abacate, cru'],
  ['🍇', 'Açaí na tigela (com xarope de guaraná)', 300, 'Açaí, polpa, com xarope de guaraná e glucose'],
  ['🍇', 'Açaí (polpa pura)', 100, 'Açaí, polpa, congelada'],
  ['🥜', 'Amendoim', 30, 'Amendoim, torrado, salgado'],
  ['🥜', 'Pasta de amendoim', 15, [588, 25, 20, 50, 6, 17]],
  ['🌰', 'Castanha-do-pará', 15, 'Castanha-do-Brasil, crua'],
  ['🫒', 'Azeite de oliva', 8, 'Azeite, de oliva, extra virgem'],
  ['🍯', 'Mel', 20, 'Mel, de abelha'],
  ['🍫', 'Chocolate ao leite', 25, 'Chocolate, ao leite'],
  ['🍪', 'Biscoito cream cracker', 30, 'Biscoito, salgado, cream cracker'],
  ['☕', 'Café com açúcar', 100, [['Café, infusão 10%', 100], ['Açúcar, refinado', 5]]],
  ['🧃', 'Suco de laranja', 200, 'Laranja, pêra, suco'],
  ['🥤', 'Refrigerante', 350, 'Refrigerante, tipo cola'],
  ['🍛', 'Prato feito (arroz, feijão, carne e salada)', 410, [
    ['Arroz, tipo 1, cozido', 150], ['Feijão, carioca, cozido', 100], ['Carne, bovina, acém, moído, cozido', 100],
    ['Alface, crespa, crua', 30], ['Tomate, com semente, cru', 30],
  ]],
  ['🍲', 'Feijoada', 200, 'Feijoada'],
  ['🍲', 'Estrogonofe de frango', 150, 'Estrogonofe de frango'],
  ['🍲', 'Estrogonofe de carne', 150, 'Estrogonofe de carne'],
  ['🍛', 'Baião de dois', 150, 'Baião de dois, arroz e feijão-de-corda'],
  ['🥄', 'Farofa', 30, 'Mandioca, farofa, temperada'],
  ['🍟', 'Batata frita', 100, 'Batata, inglesa, frita'],
  ['🍕', 'Pizza (muçarela)', 120, [266, 11.4, 33.3, 9.7, 2.3, 598]],
  ['🍔', 'Hambúrguer com pão', 150, [['Hambúrguer, bovino, grelhado', 90], ['Pão, trigo, francês', 60]]],
  ['🥟', 'Pastel de carne frito', 80, 'Pastel, de carne, frito'],
];

const NUTRIENTS = ['kcal', 'g', 'carbs', 'fat', 'fiber', 'sodium'];
const TACO_BY_NAME = new Map(TACO_FOODS.map(f => [f.name, f]));
const r1 = n => Math.round(n * 10) / 10;

// Valores por 100 g de um alimento da TACO, pelo nome exato da tabela.
export function fromTaco(name) {
  const f = TACO_BY_NAME.get(name);
  if (!f) throw new Error(`TACO sem "${name}"`);
  return Object.fromEntries(NUTRIENTS.map(k => [k, f[k]]));
}

// Prato montado: soma os ingredientes e devolve por 100 g do prato pronto.
function mix(parts) {
  const total = parts.reduce((s, [, grams]) => s + grams, 0);
  const sum = Object.fromEntries(NUTRIENTS.map(k => [k, 0]));
  for (const [name, grams] of parts) {
    const f = fromTaco(name);
    for (const k of NUTRIENTS) sum[k] += (f[k] * grams) / 100;
  }
  const out = Object.fromEntries(NUTRIENTS.map(k => [k, r1((sum[k] / total) * 100)]));
  return { ...out, kcal: Math.round(out.kcal), sodium: Math.round(out.sodium) };
}

function valuesOf(source) {
  if (typeof source === 'string') return fromTaco(source);
  if (Array.isArray(source[0])) return mix(source);
  return Object.fromEntries(NUTRIENTS.map((k, i) => [k, source[i]]));
}

// `ptName`: o nome original, que as medidas caseiras usam com o app em inglês.
export const FOOD_DATABASE = RAW.map(([icon, name, portion, source], i) => ({
  id: `db${i}`, icon, name: t(name), ptName: name, ...valuesOf(source), portion,
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

// Macros de `grams` gramas de um alimento por 100 g, no formato do registro do
// dia. Fibra e sódio só vêm quando o alimento traz esse dado.
export function portionOf(food, grams) {
  const k = (Number(grams) || 0) / 100;
  return {
    g: Math.round(food.g * k),
    kcal: Math.round(food.kcal * k),
    carbs: Math.round(food.carbs * k),
    fat: Math.round(food.fat * k),
    ...(Number.isFinite(food.fiber) && { fiber: r1(food.fiber * k) }),
    ...(Number.isFinite(food.sodium) && { sodium: Math.round(food.sodium * k) }),
  };
}
