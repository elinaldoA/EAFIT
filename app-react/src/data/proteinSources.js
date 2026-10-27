import { t } from '../lib/i18n';

// Proteína aproximada por porção (tabelas de composição de alimentos, valores
// arredondados). Referência rápida — não substitui orientação de nutricionista.
export const PROTEIN_SOURCES = [
  { icon: '🍗', name: t('Peito de frango grelhado'), portion: t('100 g'), g: 31 },
  { icon: '🥩', name: t('Carne bovina magra'), portion: t('100 g'), g: 26 },
  { icon: '🐟', name: t('Atum em lata'), portion: t('1 lata (120 g)'), g: 28 },
  { icon: '🥚', name: t('Ovo cozido'), portion: t('1 unidade'), g: 6 },
  { icon: '🥛', name: t('Iogurte grego natural'), portion: t('1 pote (170 g)'), g: 17 },
  { icon: '🧀', name: t('Queijo cottage'), portion: t('100 g'), g: 11 },
  { icon: '🫘', name: t('Feijão cozido'), portion: t('1 concha (100 g)'), g: 5 },
  { icon: '🥜', name: t('Amendoim'), portion: t('30 g'), g: 8 },
  { icon: '🥤', name: t('Whey protein'), portion: t('1 dose (30 g)'), g: 24 },
  { icon: '🌱', name: t('Tofu'), portion: t('100 g'), g: 8 },
];

// Adições rápidas do registro do dia: cada toque soma proteína (g), calorias e
// macros de uma porção comum. Valores aproximados e arredondados.
export const QUICK_FOODS = [
  { id: 'ovo', icon: '🥚', label: t('Ovo'), g: 6, kcal: 70, carbs: 1, fat: 5 },
  { id: 'iogurte', icon: '🥛', label: t('Iogurte'), g: 17, kcal: 120, carbs: 7, fat: 4 },
  { id: 'whey', icon: '🥤', label: t('Whey'), g: 24, kcal: 120, carbs: 3, fat: 2 },
  { id: 'frango', icon: '🍗', label: t('Frango'), g: 31, kcal: 165, carbs: 0, fat: 4 },
  { id: 'arroz', icon: '🍚', label: t('Arroz'), g: 3, kcal: 130, carbs: 28, fat: 0 },
  { id: 'feijao', icon: '🫘', label: t('Feijão'), g: 5, kcal: 80, carbs: 14, fat: 1 },
  { id: 'pao', icon: '🥖', label: t('Pão'), g: 4, kcal: 150, carbs: 29, fat: 2 },
  { id: 'banana', icon: '🍌', label: t('Banana'), g: 1, kcal: 90, carbs: 23, fat: 0 },
];
