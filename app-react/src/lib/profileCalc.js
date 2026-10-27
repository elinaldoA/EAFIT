import { t } from './i18n';
export function imcInfo(peso, altura) {
  if (!peso || !altura || peso < 30 || altura < 100) return null;
  const imc = peso / ((altura / 100) ** 2);
  const cls =
    imc < 18.5 ? t('Abaixo do peso') :
    imc < 25 ? t('Peso normal') :
    imc < 30 ? t('Sobrepeso') :
    imc < 35 ? t('Obesidade grau I') : t('Obesidade grau II+');
  return { value: imc.toFixed(1), cls };
}

const DAY_MS = 86400000;
const PROJECTION_WINDOW_DAYS = 42;
const PROJECTION_MIN_SPAN_DAYS = 7;
const PROJECTION_MAX_DAYS = 730;

// Quando o aluno chega ao peso-alvo se continuar na tendência dos últimos 42
// dias (regressão linear dos registros; weightLogs em ordem crescente, com
// log_date 'YYYY-MM-DD'). null se faltar histórico (2+ registros espalhados por
// 7+ dias), se a tendência não for em direção à meta ou se passar de 2 anos.
export function weightProjection(weightLogs, pesoAtual, pesoAlvo, today = new Date()) {
  const toDay = iso => new Date(`${iso}T12:00:00`).getTime() / DAY_MS;
  const now = Math.floor(today.getTime() / DAY_MS);
  const rows = (weightLogs || [])
    .filter(r => r?.log_date && Number.isFinite(r.peso))
    .map(r => ({ x: toDay(r.log_date), y: r.peso }))
    .filter(r => r.x >= now - PROJECTION_WINDOW_DAYS);
  if (rows.length < 2) return null;
  const span = rows[rows.length - 1].x - rows[0].x;
  if (span < PROJECTION_MIN_SPAN_DAYS) return null;

  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.x, 0) / n;
  const my = rows.reduce((s, r) => s + r.y, 0) / n;
  const den = rows.reduce((s, r) => s + (r.x - mx) ** 2, 0);
  if (!den) return null;
  const slope = rows.reduce((s, r) => s + (r.x - mx) * (r.y - my), 0) / den; // kg por dia

  const diff = pesoAlvo - pesoAtual;
  if (!slope || Math.sign(slope) !== Math.sign(diff)) return null;
  const days = Math.ceil(diff / slope);
  if (days > PROJECTION_MAX_DAYS) return null;

  const date = new Date(today.getTime() + days * DAY_MS);
  return { days, date, kgPerWeek: Math.round(Math.abs(slope) * 7 * 10) / 10 };
}

export function metaProgress(pesoAtual, pesoAlvo, weightLogs) {
  if (!pesoAtual || !pesoAlvo) return null;
  const diff = pesoAtual - pesoAlvo;
  if (Math.abs(diff) < 0.1) return { done: true, msg: t('🎉 Meta de peso alcançada!') };

  const first = weightLogs[0]?.peso ?? pesoAtual;
  const totalSpan = Math.abs(first - pesoAlvo) || 1;
  // Quanto já se aproximou da meta: afastar-se dela (ganhar peso quem quer perder) vale 0%, não progresso.
  const covered = totalSpan - Math.abs(diff);
  const pct = Math.max(0, Math.min(100, (covered / totalSpan) * 100));
  const msg = t('Faltam {v1}kg para a meta de {pesoAlvo}kg', { v1: Math.abs(diff).toFixed(1), pesoAlvo });
  return { done: false, pct, msg, projection: weightProjection(weightLogs, pesoAtual, pesoAlvo) };
}
