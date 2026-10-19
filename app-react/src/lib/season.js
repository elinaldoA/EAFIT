// Tema de temporada (ex.: Dia das Bruxas): decoração leve no app e no site,
// ligada no painel admin (app_settings, chave "season") e limitada por datas.
// Fora do período a decoração some sozinha, mesmo em app antigo em cache.
// A pessoa pode desligar no Perfil (vale por aparelho e por tema).
// O site lê a mesma chave em public/landing/assets/site.js.

// Hoje no fuso do app, em YYYY-MM-DD (igual a todayInAppZone de appConfig.js,
// que importa deste arquivo).
export function seasonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export const SEASONS = {
  halloween: { emoji: '🎃' },
};

export const DEFAULT_SEASON = { enabled: false, theme: '', startsOn: '', endsOn: '' };

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function normalizeSeason(value) {
  const v = value && typeof value === 'object' ? value : {};
  const theme = Object.hasOwn(SEASONS, v.theme) ? v.theme : '';
  return {
    enabled: v.enabled === true && theme !== '',
    theme,
    startsOn: isDay(v.startsOn) ? v.startsOn : '',
    endsOn: isDay(v.endsOn) ? v.endsOn : '',
  };
}

// Tema no ar hoje, ou ''. Sem as duas datas não liga: decoração esquecida
// ligada para sempre é justamente o que este limite evita.
export function activeSeason(season, today = seasonToday()) {
  if (!season?.enabled || !season.theme || !season.startsOn || !season.endsOn) return '';
  return today >= season.startsOn && today <= season.endsOn ? season.theme : '';
}

const OFF_KEY = 'eafit_season_off';
const CHANGE_EVENT = 'eafit-season-change';

export function isSeasonOff(theme) {
  try { return localStorage.getItem(OFF_KEY) === theme; } catch { return false; }
}

export function setSeasonOff(theme, off) {
  try {
    if (off) localStorage.setItem(OFF_KEY, theme);
    else localStorage.removeItem(OFF_KEY);
  } catch { /* armazenamento bloqueado: vale só nesta sessão */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onSeasonChange(fn) {
  window.addEventListener(CHANGE_EVENT, fn);
  return () => window.removeEventListener(CHANGE_EVENT, fn);
}

// Tema aplicado agora (já descontando quem desligou). Fica num módulo pra
// partes fora do React — card de compartilhar e treinador por voz — lerem.
let current = '';

export function setCurrentSeason(theme) {
  current = theme || '';
}

export function currentSeason() {
  return current;
}

// Conquista de temporada: "Treino das Bruxas <ano>" para quem treinar em
// 31/10 ou fizer 3 treinos entre 24/10 e 02/11 daquele ano. As datas são fixas
// por ano (não seguem o período do painel), pra a regra não mudar depois de
// alguém já ter ganhado.
export const FIRST_HALLOWEEN_YEAR = 2026;

export function halloweenWindow(year) {
  return { from: `${year}-10-24`, to: `${year}-11-02`, day: `${year}-10-31` };
}

export function earnedHalloween(completedDates, year) {
  const { from, to, day } = halloweenWindow(year);
  const inWindow = new Set((completedDates || []).filter(d => d >= from && d <= to));
  return inWindow.has(day) || inWindow.size >= 3;
}
