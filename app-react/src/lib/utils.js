import { TODAY_DATE, DAY_NAMES } from '../data/treinoData';

// Parses a "YYYY-MM-DD" string as a local date at noon, avoiding the UTC
// midnight parsing of `new Date(str)` shifting the day in negative-offset timezones.
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Dias restantes até endDate (negativo = já vencido). Compara datas puras
// (meio-dia local), não timestamps, pra não variar com hora do dia.
export function daysUntil(endDate) {
  const diffMs = parseLocalDate(endDate) - parseLocalDate(TODAY_DATE);
  return Math.round(diffMs / 86400000);
}

// Returns the "YYYY-MM-DD" date of `dayName` within the calendar week (Sun-Sat) containing today.
export function getDateForWeekday(dayName) {
  const idx = DAY_NAMES.indexOf(dayName);
  const today = parseLocalDate(TODAY_DATE);
  const d = new Date(today);
  d.setDate(today.getDate() + (idx - today.getDay()));
  return toDateStr(d);
}

export function getWeekStart(weeksAgo = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) - weeksAgo * 7;
  return toDateStr(new Date(now.getFullYear(), now.getMonth(), diff));
}

// Nome exibido para o usuário: apelido, senão nome, senão o e-mail.
export function getDisplayName(user) {
  const md = user?.user_metadata || {};
  return md.apelido?.trim() || md.nome?.trim() || user?.email || '';
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseRestSeconds(descanso) {
  if (!descanso) return 0;
  const min = descanso.match(/(\d+)\s*min/);
  if (min) return parseInt(min[1], 10) * 60;
  const sec = descanso.match(/(\d+)\s*s/);
  if (sec) return parseInt(sec[1], 10);
  return 0;
}

// parseFloat trunca em vírgula ("12,5" -> 12) — aceita decimal em formato pt-BR.
export function parseDecimal(str) {
  if (typeof str !== 'string') return parseFloat(str);
  return parseFloat(str.replace(',', '.'));
}

// Extrai o teto numérico de uma faixa de reps ("8-10" -> 10, "12" -> 12).
// Retorna null pra texto sem faixa numérica clara ("até a falha", "45s", cardio).
export function parseRepCeiling(repsStr) {
  const range = repsStr.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return parseInt(range[2], 10);
  const single = repsStr.match(/^(\d+)$/);
  return single ? parseInt(single[1], 10) : null;
}

export function calcStreak(dates) {
  if (!dates.length) return 0;
  const unique = [...new Set(dates)].sort().reverse();
  let streak = 0;
  let prev = parseLocalDate(TODAY_DATE);
  for (const d of unique) {
    const curr = parseLocalDate(d);
    const diff = Math.round((prev - curr) / 86400000);
    if (diff <= 1) { streak++; prev = curr; }
    else break;
  }
  return streak;
}
