import { t } from '../lib/i18n';
import { fromTaco, portionOf } from './foodDatabase';

// Proteína aproximada por porção (TACO quando o alimento está nela; whey, tofu,
// cottage e iogurte grego pelo USDA/rótulo), arredondada. Referência rápida — não substitui orientação de nutricionista.
export const PROTEIN_SOURCES = [
  { icon: '🍗', name: t('Peito de frango grelhado'), portion: t('100 g'), g: 32 },
  { icon: '🥩', name: t('Carne bovina (patinho) grelhada'), portion: t('100 g'), g: 36 },
  { icon: '🐟', name: t('Atum em lata'), portion: t('1 lata (120 g)'), g: 31 },
  { icon: '🥚', name: t('Ovo cozido'), portion: t('1 unidade'), g: 7 },
  { icon: '🥛', name: t('Iogurte grego natural'), portion: t('1 pote (170 g)'), g: 15 },
  { icon: '🧀', name: t('Queijo cottage'), portion: t('100 g'), g: 11 },
  { icon: '🫘', name: t('Feijão cozido'), portion: t('1 concha (140 g)'), g: 7 },
  { icon: '🥜', name: t('Amendoim'), portion: t('30 g'), g: 7 },
  { icon: '🥤', name: t('Whey protein'), portion: t('1 dose (30 g)'), g: 24 },
  { icon: '🌱', name: t('Tofu'), portion: t('100 g'), g: 8 },
];

// Adições rápidas do registro do dia: cada toque soma proteína (g), calorias e
// macros de uma porção comum. Quem está na TACO sai dela (com fibra e sódio);
// café com leite, iogurte e whey são porções típicas de rótulo.
const fromTable = (name, grams) => portionOf(fromTaco(name), grams);
export const QUICK_FOODS = [
  // Café da manhã primeiro, na ordem em que costuma ser comido.
  { id: 'cafe', icon: '☕', label: t('Café c/ leite'), g: 3, kcal: 80, carbs: 9, fat: 3 },
  { id: 'pao', icon: '🥖', label: t('Pão'), ...fromTable('Pão, trigo, francês', 50) },
  { id: 'ovo', icon: '🥚', label: t('Ovo'), ...fromTable('Ovo, de galinha, inteiro, cozido/10minutos', 50) },
  { id: 'queijo', icon: '🧀', label: t('Queijo'), ...fromTable('Queijo, mozarela', 40) },
  { id: 'iogurte', icon: '🥛', label: t('Iogurte'), g: 17, kcal: 120, carbs: 7, fat: 4 },
  { id: 'aveia', icon: '🥣', label: t('Aveia'), ...fromTable('Aveia, flocos, crua', 30) },
  { id: 'banana', icon: '🍌', label: t('Banana'), ...fromTable('Banana, prata, crua', 90) },
  { id: 'cuscuz', icon: '🌽', label: t('Cuscuz'), ...fromTable('Cuscuz, de milho, cozido com sal', 100) },
  // Refeições e suplemento.
  { id: 'whey', icon: '🥤', label: t('Whey'), g: 24, kcal: 120, carbs: 3, fat: 2 },
  { id: 'frango', icon: '🍗', label: t('Frango'), ...fromTable('Frango, peito, sem pele, grelhado', 100) },
  { id: 'arroz', icon: '🍚', label: t('Arroz'), ...fromTable('Arroz, tipo 1, cozido', 100) },
  { id: 'feijao', icon: '🫘', label: t('Feijão'), ...fromTable('Feijão, carioca, cozido', 100) },
];
