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

// Adições rápidas do registro do dia.
export const PROTEIN_QUICK_ADD = [
  { g: 6, icon: '🥚', label: t('Ovo') },
  { g: 17, icon: '🥛', label: t('Iogurte') },
  { g: 24, icon: '🥤', label: t('Whey') },
  { g: 31, icon: '🍗', label: t('Frango') },
];
