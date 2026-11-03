import { t } from './i18n';
import { FOOD_DATABASE, portionOf } from '../data/foodDatabase';

// Refeições completas pensadas para cada meta principal, com as porções
// recalculadas para o que falta no dia da pessoa. Cada modelo tem itens com um
// papel:
// - 'p' (proteína): a porção sobe ou desce até a refeição bater a proteína-alvo;
// - 'c' (carboidrato): ajusta as calorias depois da proteína;
// - 'v' (verdura, legume, fruta) e 'f' (gordura): ficam na porção do modelo.
// Valores dos alimentos vêm da base da busca (TACO e afins), por 100 g.
// Não substitui orientação de nutricionista.

export const MEAL_ORDER = ['cafe', 'almoco', 'lanche', 'jantar', 'ceia'];
const METAS = ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia'];
const ALL = METAS;
const CUT = ['emagrecer', 'definicao'];
const BULK = ['massa', 'forca'];

// Fração das calorias do dia em cada refeição, por meta. Quem quer ganhar massa
// tem ceia; quem está em déficit concentra no almoço e come menos à noite.
const MEAL_SHARE = {
  massa:       { cafe: 0.22, almoco: 0.30, lanche: 0.18, jantar: 0.22, ceia: 0.08 },
  forca:       { cafe: 0.23, almoco: 0.32, lanche: 0.17, jantar: 0.23, ceia: 0.05 },
  emagrecer:   { cafe: 0.25, almoco: 0.38, lanche: 0.12, jantar: 0.25, ceia: 0 },
  definicao:   { cafe: 0.25, almoco: 0.35, lanche: 0.15, jantar: 0.20, ceia: 0.05 },
  saude:       { cafe: 0.25, almoco: 0.35, lanche: 0.15, jantar: 0.25, ceia: 0 },
  resistencia: { cafe: 0.25, almoco: 0.33, lanche: 0.20, jantar: 0.22, ceia: 0 },
};
// Piso de cada refeição: abaixo disso não é refeição, é beliscar.
const MIN_KCAL = { cafe: 250, almoco: 350, lanche: 150, jantar: 300, ceia: 120 };
const MIN_PROTEIN = { cafe: 15, almoco: 25, lanche: 10, jantar: 25, ceia: 10 };
// Quanto a porção pode mudar em relação ao modelo.
const P_RANGE = [0.6, 2];
const C_RANGE = [0.4, 2.5];
const MAX_OVER_PLAN = 1.25;

// Porção em unidades: ovo, pão, fatia, dose de whey.
const UNIT = {
  'Ovo cozido': 50,
  'Pão francês': 50,
  'Pão de forma integral': 25,
  'Tortilha de trigo (wrap)': 40,
  'Whey protein (pó)': 15,
};

const BY_NAME = new Map(FOOD_DATABASE.map(f => [f.ptName, f]));

// [nome na base, gramas, papel]
const TEMPLATES = [
  // Café da manhã
  { id: 'cafe_ovos_integral', meal: 'cafe', metas: ['emagrecer', 'definicao', 'saude', 'forca'],
    name: () => t('Ovos com pão integral e mamão'),
    why: () => t('Proteína logo cedo segura a fome até o almoço.'),
    items: [['Ovo cozido', 100, 'p'], ['Pão de forma integral', 50, 'c'], ['Mamão', 150, 'v']] },
  { id: 'cafe_iogurte_chia', meal: 'cafe', metas: CUT,
    name: () => t('Iogurte proteico com morango, aveia e chia'),
    why: () => t('Muita proteína e fibra com poucas calorias.'),
    items: [['Iogurte proteico (sem açúcar)', 170, 'p'], ['Aveia em flocos', 20, 'c'], ['Morango', 100, 'v'], ['Chia', 10, 'f']] },
  { id: 'cafe_crepioca', meal: 'cafe', metas: ['definicao', 'emagrecer', 'forca'],
    name: () => t('Crepioca com frango'),
    why: () => t('Rápida, com proteína de verdade e carboidrato na medida.'),
    items: [['Ovo cozido', 100, 'p'], ['Frango desfiado (peito cozido)', 50, 'p'], ['Tapioca (goma hidratada)', 30, 'c']] },
  { id: 'cafe_bowl_massa', meal: 'cafe', metas: ['massa', 'forca', 'resistencia'],
    name: () => t('Mingau de aveia com banana, whey e pasta de amendoim'),
    why: () => t('Muitas calorias boas num prato fácil de comer.'),
    items: [['Leite integral', 250, 'c'], ['Aveia em flocos', 50, 'c'], ['Banana prata', 90, 'c'], ['Whey protein (pó)', 30, 'p'], ['Pasta de amendoim', 15, 'f']] },
  { id: 'cafe_cuscuz', meal: 'cafe', metas: ['massa', 'forca', 'resistencia', 'saude'],
    name: () => t('Cuscuz com ovos e queijo'),
    why: () => t('Carboidrato para o dia e proteína de ovo e queijo.'),
    items: [['Cuscuz de milho', 120, 'c'], ['Ovo cozido', 100, 'p'], ['Queijo minas frescal', 30, 'p']] },
  { id: 'cafe_pao_ovo', meal: 'cafe', metas: ['saude', 'massa', 'resistencia', 'forca'],
    name: () => t('Pão francês com ovos, leite e banana'),
    why: () => t('O café de sempre, com proteína suficiente.'),
    items: [['Pão francês', 50, 'c'], ['Ovo cozido', 100, 'p'], ['Leite semidesnatado', 200, 'v'], ['Banana prata', 70, 'c']] },

  // Almoço
  { id: 'almoco_pf', meal: 'almoco', metas: ALL,
    name: () => t('Frango, arroz, feijão e salada'),
    why: () => t('O prato brasileiro equilibrado: proteína, carboidrato, fibra e verdura.'),
    items: [['Peito de frango grelhado', 120, 'p'], ['Arroz branco cozido', 100, 'c'], ['Feijão carioca cozido', 80, 'c'], ['Alface', 30, 'v'], ['Tomate', 80, 'v'], ['Azeite de oliva', 5, 'f']] },
  { id: 'almoco_patinho_batata', meal: 'almoco', metas: ['definicao', 'emagrecer', 'forca', 'massa'],
    name: () => t('Patinho com batata-doce e brócolis'),
    why: () => t('Carne magra, carboidrato que sacia e legume à vontade.'),
    items: [['Carne bovina (patinho) grelhada', 120, 'p'], ['Batata-doce cozida', 150, 'c'], ['Brócolis cozido', 100, 'v']] },
  { id: 'almoco_tilapia', meal: 'almoco', metas: ['emagrecer', 'definicao', 'saude'],
    name: () => t('Tilápia com batata, brócolis e salada'),
    why: () => t('Peixe magro e metade do prato de vegetais: volume com poucas calorias.'),
    items: [['Tilápia grelhada', 150, 'p'], ['Batata inglesa cozida', 120, 'c'], ['Brócolis cozido', 100, 'v'], ['Alface', 30, 'v'], ['Tomate', 80, 'v']] },
  { id: 'almoco_salmao', meal: 'almoco', metas: ['saude', 'definicao', 'resistencia'],
    name: () => t('Salmão com arroz integral e legumes'),
    why: () => t('Gordura boa do peixe e fibra do arroz integral.'),
    items: [['Salmão grelhado', 120, 'p'], ['Arroz integral cozido', 100, 'c'], ['Abobrinha cozida', 100, 'v'], ['Cenoura cozida', 80, 'v']] },
  { id: 'almoco_macarrao', meal: 'almoco', metas: ['massa', 'forca', 'resistencia'],
    name: () => t('Macarrão com carne moída e molho de tomate'),
    why: () => t('Muito carboidrato para treinar e recuperar, e fácil de comer em quantidade.'),
    items: [['Macarrão cozido', 200, 'c'], ['Carne moída refogada', 120, 'p'], ['Tomate', 80, 'v'], ['Azeite de oliva', 8, 'f']] },
  { id: 'almoco_ovos_couve', meal: 'almoco', metas: ['saude', 'massa', 'resistencia', 'forca'],
    name: () => t('Arroz, feijão, ovos e couve'),
    why: () => t('Barato e completo: a proteína do feijão e do ovo se somam.'),
    items: [['Arroz branco cozido', 120, 'c'], ['Feijão preto cozido', 100, 'c'], ['Ovo cozido', 100, 'p'], ['Couve refogada', 80, 'v']] },

  // Lanche
  { id: 'lanche_iogurte', meal: 'lanche', metas: ['emagrecer', 'definicao', 'saude'],
    name: () => t('Iogurte grego com morango e aveia'),
    why: () => t('Lanche com proteína que segura até o jantar.'),
    items: [['Iogurte grego natural', 170, 'p'], ['Morango', 100, 'v'], ['Aveia em flocos', 15, 'c']] },
  { id: 'lanche_cottage', meal: 'lanche', metas: CUT,
    name: () => t('Cottage com biscoito de arroz e tomate'),
    why: () => t('Quase só proteína, crocante e leve.'),
    items: [['Queijo cottage', 100, 'p'], ['Biscoito de arroz', 20, 'c'], ['Tomate', 60, 'v']] },
  { id: 'lanche_sanduiche', meal: 'lanche', metas: ['saude', 'definicao', 'forca', 'resistencia', 'massa'], tags: ['pos'],
    name: () => t('Sanduíche de frango no pão integral'),
    why: () => t('Proteína e carboidrato na mesma mordida, bom depois do treino.'),
    items: [['Pão de forma integral', 50, 'c'], ['Frango desfiado (peito cozido)', 80, 'p'], ['Alface', 15, 'v'], ['Tomate', 40, 'v']] },
  { id: 'lanche_vitamina', meal: 'lanche', metas: BULK.concat('resistencia'), tags: ['pos'],
    name: () => t('Vitamina de banana com aveia e whey'),
    why: () => t('Calorias e proteína em forma líquida, fácil mesmo sem fome.'),
    items: [['Leite integral', 300, 'c'], ['Banana prata', 90, 'c'], ['Aveia em flocos', 30, 'c'], ['Whey protein (pó)', 30, 'p'], ['Pasta de amendoim', 15, 'f']] },
  { id: 'lanche_pre', meal: 'lanche', metas: ALL, tags: ['pre'],
    name: () => t('Tapioca com banana, mel e ovo'),
    why: () => t('Carboidrato fácil de digerir e pouca gordura: energia sem pesar no treino.'),
    items: [['Tapioca (goma hidratada)', 40, 'c'], ['Banana prata', 70, 'c'], ['Mel', 10, 'c'], ['Ovo cozido', 50, 'p']] },
  { id: 'lanche_fruta_castanha', meal: 'lanche', metas: ['saude', 'resistencia', 'emagrecer'],
    name: () => t('Maçã com iogurte natural e castanha'),
    why: () => t('Fruta, proteína e gordura boa em porção pequena.'),
    items: [['Maçã', 130, 'v'], ['Iogurte natural', 170, 'p'], ['Castanha-do-pará', 10, 'f']] },

  // Jantar
  { id: 'jantar_omelete', meal: 'jantar', metas: ['emagrecer', 'definicao', 'saude'],
    name: () => t('Omelete com salada e uma fatia de pão integral'),
    why: () => t('Jantar leve com bastante proteína e volume de salada.'),
    items: [['Ovo cozido', 150, 'p'], ['Pão de forma integral', 25, 'c'], ['Alface', 40, 'v'], ['Tomate', 80, 'v'], ['Abobrinha cozida', 80, 'v']] },
  { id: 'jantar_frango_legumes', meal: 'jantar', metas: ALL, tags: ['pos'],
    name: () => t('Frango com arroz integral e legumes'),
    why: () => t('Proteína magra e legumes; o arroz entra na medida da sua meta.'),
    items: [['Peito de frango grelhado', 120, 'p'], ['Arroz integral cozido', 80, 'c'], ['Brócolis cozido', 100, 'v'], ['Cenoura cozida', 80, 'v']] },
  { id: 'jantar_atum', meal: 'jantar', metas: CUT,
    name: () => t('Atum com batata-doce e salada'),
    why: () => t('Proteína magra e pronta, com carboidrato que sacia.'),
    items: [['Atum em lata (natural)', 120, 'p'], ['Batata-doce cozida', 100, 'c'], ['Alface', 30, 'v'], ['Tomate', 80, 'v'], ['Azeite de oliva', 5, 'f']] },
  { id: 'jantar_wrap', meal: 'jantar', metas: ['saude', 'definicao', 'forca', 'resistencia'],
    name: () => t('Wrap de frango com salada'),
    why: () => t('Prático, com proteína e carboidrato contados.'),
    items: [['Tortilha de trigo (wrap)', 40, 'c'], ['Frango desfiado (peito cozido)', 100, 'p'], ['Alface', 20, 'v'], ['Tomate', 50, 'v']] },
  { id: 'jantar_patinho_mandioca', meal: 'jantar', metas: BULK,
    name: () => t('Patinho com mandioca e couve'),
    why: () => t('Refeição farta para fechar o superávit do dia.'),
    items: [['Carne bovina (patinho) grelhada', 150, 'p'], ['Mandioca cozida', 150, 'c'], ['Couve refogada', 80, 'v'], ['Azeite de oliva', 8, 'f']] },
  { id: 'jantar_tofu', meal: 'jantar', metas: ['saude', 'resistencia', 'definicao'],
    name: () => t('Tofu com quinoa e legumes'),
    why: () => t('Opção sem carne, com proteína completa da soja.'),
    items: [['Tofu', 150, 'p'], ['Quinoa cozida', 120, 'c'], ['Brócolis cozido', 100, 'v'], ['Azeite de oliva', 5, 'f']] },
  { id: 'jantar_lentilha', meal: 'jantar', metas: ['saude', 'resistencia', 'massa'],
    name: () => t('Arroz com lentilha e ovo'),
    why: () => t('Fibra e proteína vegetal, com o ovo completando.'),
    items: [['Arroz branco cozido', 100, 'c'], ['Lentilha cozida', 100, 'c'], ['Ovo cozido', 50, 'p'], ['Tomate', 60, 'v']] },

  // Ceia
  { id: 'ceia_iogurte', meal: 'ceia', metas: ['massa', 'definicao', 'forca', 'saude'],
    name: () => t('Iogurte grego com castanha'),
    why: () => t('Proteína de digestão lenta para a noite.'),
    items: [['Iogurte grego natural', 170, 'p'], ['Castanha-do-pará', 10, 'f']] },
  { id: 'ceia_cottage', meal: 'ceia', metas: ['emagrecer', 'definicao', 'saude'],
    name: () => t('Cottage com morango'),
    why: () => t('Se bater fome à noite: proteína com pouquíssimas calorias.'),
    items: [['Queijo cottage', 100, 'p'], ['Morango', 100, 'v']] },
  { id: 'ceia_leite_aveia', meal: 'ceia', metas: BULK.concat('resistencia'),
    name: () => t('Leite com aveia e pasta de amendoim'),
    why: () => t('Calorias extras antes de dormir, sem pesar.'),
    items: [['Leite integral', 250, 'p'], ['Aveia em flocos', 30, 'c'], ['Pasta de amendoim', 15, 'f']] },
  { id: 'ceia_ovos', meal: 'ceia', metas: ['emagrecer', 'saude', 'resistencia'],
    name: () => t('Ovos cozidos com tomate'),
    why: () => t('Proteína simples e leve para fechar o dia.'),
    items: [['Ovo cozido', 100, 'p'], ['Tomate', 80, 'v']] },
];

// Foco de cada meta: o porquê das refeições, em uma frase, e três regras.
const FOCUS = {
  massa: {
    title: () => t('Ganho de massa'),
    line: () => t('Comer um pouco acima do gasto, todos os dias, com proteína em todas as refeições.'),
    tips: [
      () => t('Não pule refeições: 5 por dia facilitam chegar às calorias.'),
      () => t('Carboidrato em todas as refeições, principalmente depois do treino.'),
      () => t('Sem fome? Calorias líquidas ajudam: vitamina com aveia, banana e pasta de amendoim.'),
    ],
  },
  forca: {
    title: () => t('Aumento de força'),
    line: () => t('Leve superávit e carboidrato para render no treino pesado.'),
    tips: [
      () => t('Uma refeição com carboidrato 1 a 2 horas antes de treinar.'),
      () => t('Depois do treino, junte proteína e carboidrato.'),
      () => t('Divida a proteína do dia em 4 refeições ou mais.'),
    ],
  },
  emagrecer: {
    title: () => t('Emagrecimento'),
    line: () => t('Déficit de calorias com proteína alta, para perder gordura e não músculo.'),
    tips: [
      () => t('Metade do prato com verduras e legumes: volume que sacia com poucas calorias.'),
      () => t('Proteína em toda refeição segura a fome.'),
      () => t('Prefira grelhado, assado ou cozido, e azeite na medida (1 colher de chá).'),
    ],
  },
  definicao: {
    title: () => t('Definição muscular'),
    line: () => t('Déficit leve e a proteína mais alta (2,2 g por kg) para manter o músculo.'),
    tips: [
      () => t('Carboidrato perto do treino; à noite, mais proteína e legumes.'),
      () => t('Proteína dividida em 4 a 5 refeições de 25 a 40 g.'),
      () => t('Gordura de azeite, castanhas e peixe, em pouca quantidade.'),
    ],
  },
  saude: {
    title: () => t('Saúde e bem-estar'),
    line: () => t('Calorias de manutenção e prato variado, com comida de verdade.'),
    tips: [
      () => t('Prato colorido: legumes, verduras e frutas todos os dias.'),
      () => t('Arroz com feijão é uma ótima base: carboidrato, fibra e proteína.'),
      () => t('Peixe 2 vezes por semana e pouco ultraprocessado.'),
    ],
  },
  resistencia: {
    title: () => t('Resistência / Condicionamento'),
    line: () => t('Carboidrato é o combustível dos treinos longos; a proteína cuida da recuperação.'),
    tips: [
      () => t('Carboidrato em todas as refeições, mais nos dias de treino longo.'),
      () => t('Antes de treinar, algo leve e fácil de digerir: banana, tapioca, pão.'),
      () => t('Depois de treinos com muito suor, reponha água e sal.'),
    ],
  },
};

const metaOf = meta => (METAS.includes(meta) ? meta : 'saude');
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

export function goalFocus(meta) {
  const f = FOCUS[metaOf(meta)];
  return { meta: metaOf(meta), title: f.title(), line: f.line(), tips: f.tips.map(tip => tip()) };
}

// O que esta refeição deve ter: o que falta do dia dividido entre ela e as que
// ainda vêm, no peso que a meta dá a cada uma. "outro" conta como lanche.
// tight: as calorias do dia já acabaram ou quase; a refeição fica no piso.
export function mealTarget({ goals, totals, meal, meta }) {
  if (!goals?.kcal || !goals?.protein) return null;
  const m = MEAL_ORDER.includes(meal) ? meal : 'lanche';
  const share = MEAL_SHARE[metaOf(meta)];
  const ahead = MEAL_ORDER.slice(MEAL_ORDER.indexOf(m));
  const weight = Math.max(share[m], 0.05);
  const total = ahead.reduce((s, k) => s + (k === m ? weight : share[k]), 0);
  const f = weight / total;
  const leftKcal = goals.kcal - (totals?.kcal || 0);
  const leftProtein = goals.protein - (totals?.protein || 0);
  // Refeições puladas não viram uma refeição gigante: no máximo 25% acima do
  // que o plano dá para ela.
  const kcal = Math.min(Math.round(leftKcal * f), Math.round(goals.kcal * weight * MAX_OVER_PLAN));
  const protein = Math.min(Math.round(leftProtein * f), Math.round(goals.protein * weight * MAX_OVER_PLAN));
  return {
    meal: m,
    kcal: Math.max(MIN_KCAL[m], Math.round(kcal / 10) * 10),
    protein: Math.max(MIN_PROTEIN[m], protein),
    tight: kcal < MIN_KCAL[m],
  };
}

function roundGrams(name, grams, base) {
  const unit = UNIT[name];
  if (unit) return Math.max(unit, Math.round(grams / unit) * unit);
  const step = base <= 30 ? 5 : 10;
  return Math.max(step, Math.round(grams / step) * step);
}

function sumOf(list) {
  const out = { g: 0, kcal: 0, carbs: 0, fat: 0 };
  for (const it of list) for (const k of Object.keys(out)) out[k] += it[k] || 0;
  return out;
}

// Ajusta as porções do modelo para chegar perto do alvo: primeiro a proteína,
// depois as calorias pelo carboidrato. Devolve os itens prontos para o diário.
export function fitMeal(template, target) {
  const parts = template.items.map(([name, grams, role]) => ({ name, grams, role, food: BY_NAME.get(name) }));
  const at = (p, grams) => portionOf(p.food, grams);
  const sumRole = (role, scale = 1, k = 'g') => parts.filter(p => p.role === role).reduce((s, p) => s + at(p, p.grams * scale)[k], 0);

  // O carboidrato também traz proteína (feijão, aveia, leite): algumas voltas
  // acertam os dois fatores juntos.
  const protFlex = sumRole('p', 1, 'g');
  const kcalCarb = sumRole('c', 1, 'kcal');
  const fixedProt = sumRole('v', 1, 'g') + sumRole('f', 1, 'g');
  const fixedKcal = sumRole('v', 1, 'kcal') + sumRole('f', 1, 'kcal');
  let fp = 1;
  let fc = 1;
  for (let i = 0; i < 4; i++) {
    if (protFlex > 0) fp = clamp((target.protein - fixedProt - sumRole('c', fc, 'g')) / protFlex, P_RANGE);
    if (kcalCarb > 0) fc = clamp((target.kcal - fixedKcal - sumRole('p', fp, 'kcal')) / kcalCarb, C_RANGE);
  }

  const items = parts.map(p => {
    const scale = p.role === 'p' ? fp : p.role === 'c' ? fc : 1;
    const grams = roundGrams(p.name, p.grams * scale, p.grams);
    const unit = UNIT[p.name];
    const n = unit ? grams / unit : 0;
    // name e amount: para a tela; label: o nome que vai para o diário.
    const egg = p.name === 'Ovo cozido';
    const name = egg ? (n === 1 ? t('1 ovo cozido') : t('{n} ovos cozidos', { n })) : p.food.name;
    const amount = egg ? '' : `${grams} g`;
    const label = egg ? name : `${name} ${grams} g`;
    return { icon: p.food.icon, label, name, amount, grams, ...at(p, grams) };
  });
  return { items, total: sumOf(items) };
}

// Distância do alvo: calorias e proteína pesam igual; passar das calorias custa
// mais que ficar abaixo.
function missScore(total, target) {
  const k = (total.kcal - target.kcal) / target.kcal;
  const p = (total.g - target.protein) / target.protein;
  return Math.abs(k) * (k > 0 ? 1.5 : 1) + Math.abs(p) * (p < 0 ? 1.5 : 0.5);
}

// Hora do treino perto: antes, carboidrato leve; depois, proteína com carboidrato.
export function trainingWindow(hour, trainingHour) {
  if (trainingHour == null || trainingHour === '' || !Number.isFinite(Number(trainingHour))) return null;
  const diff = Number(trainingHour) - hour;
  if (diff > 0 && diff <= 2.5) return 'pre';
  if (diff <= 0 && diff >= -2) return 'pos';
  return null;
}

// Até `limit` refeições para esta refeição e esta meta, da que mais encaixa no
// alvo para a que menos. Sem modelo da meta para essa refeição, usa os outros.
export function suggestGoalMeals({ goals, totals, meal, meta, hour, trainingHour, limit = 3 }) {
  const target = mealTarget({ goals, totals, meal, meta });
  if (!target) return { target: null, meals: [] };
  const m = metaOf(meta);
  const windowTag = trainingWindow(hour, trainingHour);
  const forMeal = TEMPLATES.filter(tp => tp.meal === target.meal);
  const pool = forMeal.filter(tp => tp.metas.includes(m));
  const list = (pool.length ? pool : forMeal).map(tp => {
    const fit = fitMeal(tp, target);
    let score = missScore(fit.total, target);
    // Treino perto: a refeição feita para esse momento vem primeiro.
    if (windowTag && tp.tags?.includes(windowTag)) score -= 2;
    // Calorias acabando: o mais leve primeiro.
    if (target.tight) score += fit.total.kcal / 1000;
    return { id: tp.id, name: tp.name(), why: tp.why(), training: windowTag && tp.tags?.includes(windowTag) ? windowTag : null, ...fit, score };
  });
  list.sort((a, b) => a.score - b.score);
  return { target, window: windowTag, meals: list.slice(0, limit) };
}

export const __TEMPLATES = TEMPLATES;
