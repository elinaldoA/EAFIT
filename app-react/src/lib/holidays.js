import { toDateStr } from './utils';
import { lang, t } from './i18n';

// Domingo de Páscoa (algoritmo gregoriano anônimo) — base dos feriados móveis.
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day, 12);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// n-ésima ocorrência de um dia da semana (0 = domingo) no mês; n = -1 → última.
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(year, month, 1, 12);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (n - 1) * 7, 12);
  }
  const last = new Date(year, month + 1, 0, 12);
  const back = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - back, 12);
}

const fixed = (year, month, day) => new Date(year, month - 1, day, 12);

function holidaysBR(year) {
  const easter = easterSunday(year);
  const list = [
    [fixed(year, 1, 1), t('Confraternização Universal')],
    [addDays(easter, -47), t('Carnaval')],
    [addDays(easter, -2), t('Sexta-feira Santa')],
    [fixed(year, 4, 21), t('Tiradentes')],
    [fixed(year, 5, 1), t('Dia do Trabalho')],
    [addDays(easter, 60), t('Corpus Christi')],
    [fixed(year, 9, 7), t('Independência do Brasil')],
    [fixed(year, 10, 12), t('Nossa Senhora Aparecida')],
    [fixed(year, 11, 2), t('Finados')],
    [fixed(year, 11, 15), t('Proclamação da República')],
    [fixed(year, 12, 25), t('Natal')],
  ];
  // Consciência Negra virou feriado nacional em 2024 (Lei 14.759/2023).
  if (year >= 2024) list.push([fixed(year, 11, 20), t('Consciência Negra')]);
  return list;
}

function holidaysUS(year) {
  return [
    [fixed(year, 1, 1), t('Ano Novo')],
    [nthWeekday(year, 0, 1, 3), t('Dia de Martin Luther King Jr.')],
    [nthWeekday(year, 1, 1, 3), t('Dia dos Presidentes')],
    [nthWeekday(year, 4, 1, -1), t('Memorial Day')],
    [fixed(year, 6, 19), t('Juneteenth')],
    [fixed(year, 7, 4), t('Independência dos EUA')],
    [nthWeekday(year, 8, 1, 1), t('Labor Day')],
    [nthWeekday(year, 9, 1, 2), t('Dia de Colombo')],
    [fixed(year, 11, 11), t('Dia dos Veteranos')],
    [nthWeekday(year, 10, 4, 4), t('Ação de Graças')],
    [fixed(year, 12, 25), t('Natal')],
  ];
}

// Feriados nacionais do ano como Map "YYYY-MM-DD" → nome. O país segue o
// idioma do app: pt → Brasil, en → Estados Unidos (feriados federais).
export function getHolidays(year, language = lang) {
  const list = language === 'en' ? holidaysUS(year) : holidaysBR(year);
  return new Map(list.map(([date, name]) => [toDateStr(date), name]));
}
