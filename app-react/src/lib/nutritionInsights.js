import { parseLocalDate, toDateStr } from './utils';

const DAY_MS = 86400000;
export const MIN_LOGGED_DAYS = 3;
// Faixa considerada "na meta" de calorias: 90% a 110% do alvo.
const ON_TARGET = [0.9, 1.1];
const WEIGHT_WINDOW_DAYS = 28;
const WEIGHT_MIN_SPAN_DAYS = 7;
const WEIGHT_FLAT_KG_WEEK = 0.1;

// Série diária contínua dos últimos `days` dias até `endDate` (inclusive), com
// zeros nos dias sem registro. logs: linhas de protein_logs.
export function buildNutritionSeries(logs, endDate, days) {
  const byDate = new Map((logs || []).map(l => [l.log_date, l]));
  const end = parseLocalDate(endDate);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const date = toDateStr(d);
    const r = byDate.get(date);
    out.push({
      date,
      protein: Number(r?.amount_g) || 0,
      kcal: Number(r?.kcal) || 0,
      carbs: Number(r?.carbs_g) || 0,
      fat: Number(r?.fat_g) || 0,
    });
  }
  return out;
}

// Resumo dos últimos 7 dias fechados (hoje ainda está em andamento e não entra).
// Só conta dia com calorias registradas, para um dia esquecido não puxar a média.
export function kcalWeekSummary(series, kcalGoal) {
  const week = series.slice(0, -1).slice(-7).filter(d => d.kcal > 0);
  const loggedDays = week.length;
  if (!loggedDays || !kcalGoal) return { loggedDays, avgKcal: 0, ratio: 0, daysOnTarget: 0, verdict: null };
  const avgKcal = Math.round(week.reduce((s, d) => s + d.kcal, 0) / loggedDays);
  const ratio = avgKcal / kcalGoal;
  const daysOnTarget = week.filter(d => d.kcal >= kcalGoal * ON_TARGET[0] && d.kcal <= kcalGoal * ON_TARGET[1]).length;
  const verdict = loggedDays < MIN_LOGGED_DAYS ? null : ratio < ON_TARGET[0] ? 'low' : ratio > ON_TARGET[1] ? 'high' : 'ok';
  return { loggedDays, avgKcal, ratio, daysOnTarget, verdict };
}

// Variação de peso em kg por semana nos últimos 28 dias (primeiro ao último
// registro). weightLogs em ordem crescente: { log_date, peso }. null sem
// histórico (2+ registros espalhados por 7+ dias).
export function weightRatePerWeek(weightLogs, today) {
  const toDay = iso => new Date(`${iso}T12:00:00`).getTime() / DAY_MS;
  const now = toDay(today);
  const rows = (weightLogs || [])
    .filter(r => r?.log_date && Number.isFinite(r.peso))
    .map(r => ({ x: toDay(r.log_date), y: r.peso }))
    .filter(r => r.x >= now - WEIGHT_WINDOW_DAYS && r.x <= now);
  if (rows.length < 2) return null;
  const span = rows[rows.length - 1].x - rows[0].x;
  if (span < WEIGHT_MIN_SPAN_DAYS) return null;
  return Math.round(((rows[rows.length - 1].y - rows[0].y) / span) * 7 * 10) / 10;
}

// Direção esperada do peso pela meta principal do Perfil.
function expectedDirection(meta) {
  if (meta === 'emagrecer' || meta === 'definicao') return -1;
  if (meta === 'massa') return 1;
  return 0;
}

// Leitura da semana cruzando calorias, meta e peso. Devolve um código que a
// tela traduz em texto; null quando ainda não há dados suficientes.
export function nutritionReading({ verdict, loggedDays }, meta, weightRate) {
  if (!loggedDays) return null;
  if (!verdict) return 'few_days';
  const dir = expectedDirection(meta);
  if (verdict === 'low') return dir > 0 ? 'below_gain' : dir < 0 ? 'below_loss' : 'below';
  if (verdict === 'high') return dir < 0 ? 'above_loss' : dir > 0 ? 'above_gain' : 'above';
  // Na meta de calorias: confere se o peso anda na direção esperada.
  if (dir === 0 || weightRate === null) return 'on_track';
  const moving = Math.abs(weightRate) >= WEIGHT_FLAT_KG_WEEK && Math.sign(weightRate) === dir;
  return moving ? 'on_track' : 'plateau';
}
