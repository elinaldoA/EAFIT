import { parseLocalDate, toDateStr } from './utils';

// Contas do dia da aba Nutrição que não dependem da tela: o que sobrou nos
// totais sem detalhe, fibra e sódio do dia, e a lista de dias recentes.

// Quantos dias a aba olha para trás (gráficos, hábito, correção de um dia).
export const HISTORY_DAYS = 14;

// O que está nos totais mas sem detalhe no diário (registros de antes do diário
// ou ajuste manual): { kcal, protein } ou null se tudo está detalhado.
export function unloggedRest(entries, totals) {
  const sum = k => entries.reduce((s, e) => s + (e[k] || 0), 0);
  const kcal = Math.max(0, totals.kcal - sum('kcal'));
  const prot = Math.max(0, totals.protein - sum('g'));
  return kcal || prot ? { kcal, protein: prot } : null;
}

// Fibra e sódio do dia, só dos registros que trazem o dado: { fiber, sodium,
// partial } (partial = há registros sem esse dado) ou null se nenhum traz.
export function dayMicros(entries) {
  const known = entries.filter(e => e.fiber != null || e.sodium != null);
  if (!known.length) return null;
  return {
    fiber: Math.round(known.reduce((sum, e) => sum + (Number(e.fiber) || 0), 0) * 10) / 10,
    sodium: Math.round(known.reduce((sum, e) => sum + (Number(e.sodium) || 0), 0)),
    partial: known.length < entries.length,
  };
}

// `count` datas (YYYY-MM-DD) terminando em `today`, da mais recente para a mais antiga.
export function recentDays(today, count = HISTORY_DAYS) {
  const out = [today];
  const d = parseLocalDate(today);
  for (let i = 1; i < count; i++) {
    d.setDate(d.getDate() - 1);
    out.push(toDateStr(d));
  }
  return out;
}
