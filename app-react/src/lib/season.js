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
// partes fora do React — card de compartilhar, treinador por voz, textos de
// t() e spinner — lerem.
let current = '';

export function setCurrentSeason(theme) {
  current = theme || '';
}

export function currentSeason() {
  return current;
}

// Última configuração de tema vista, guardada no aparelho: o app abre já com o
// tema (sem piscar as cores normais) enquanto busca a configuração nova. As
// datas continuam valendo, então um tema guardado vencido não liga.
const CACHE_KEY = 'eafit_season_cache';

export function cacheSeason(season) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(normalizeSeason(season))); } catch { /* sem storage */ }
}

export function cachedSeason() {
  try { return normalizeSeason(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); } catch { return DEFAULT_SEASON; }
}

// Abóbora no lugar do ícone da aba do navegador.
const HALLOWEEN_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M32 16c1-6 5-9 9-9' stroke='%2316a34a' stroke-width='5' fill='none' stroke-linecap='round'/%3E%3Cellipse cx='20' cy='38' rx='14' ry='20' fill='%23ea580c'/%3E%3Cellipse cx='44' cy='38' rx='14' ry='20' fill='%23ea580c'/%3E%3Cellipse cx='32' cy='38' rx='14' ry='21' fill='%23f97316'/%3E%3Cpath d='M17 29l9 6-10 2zM47 29l-9 6 10 2z' fill='%23fde047'/%3E%3Cpath d='M18 45q14 9 28 0l-4 5-4-3-4 4-4-4-4 3z' fill='%23fde047'/%3E%3C/svg%3E";
const SEASON_COLOR = { halloween: '#120c1a' };
const original = {};

// Liga/desliga o tema no documento: <html data-season> (styles/season.css),
// cor da barra de status e favicon. Chamado no boot e pelo SeasonDecor.
export function applySeason(theme) {
  setCurrentSeason(theme);
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme) root.setAttribute('data-season', theme);
  else root.removeAttribute('data-season');

  const meta = document.querySelector('meta[name="theme-color"]');
  const icon = document.querySelector('link[rel="icon"]');
  if (meta && original.color === undefined) original.color = meta.getAttribute('content');
  if (icon && original.icon === undefined) original.icon = icon.getAttribute('href');
  if (meta) meta.setAttribute('content', SEASON_COLOR[theme] || original.color);
  if (icon) icon.setAttribute('href', theme === 'halloween' ? HALLOWEEN_FAVICON : original.icon);
}

// Antes do primeiro render (main.jsx): tema guardado, se ainda no período.
export function bootSeason() {
  const theme = activeSeason(cachedSeason());
  applySeason(theme && !isSeasonOff(theme) ? theme : '');
}

// Emojis decorativos dos textos do app trocados no Dia das Bruxas (t() em
// lib/i18n.js). Só os de enfeite: avisos, status e carinhas de humor ficam.
// Emoji dentro de sequência (🧑‍🏫) ou com tom de pele fica como está.
const HALLOWEEN_EMOJI = { '🔥': '🎃', '🎉': '👻', '💪': '🦇', '🎯': '🔮', '🚀': '🧹', '💡': '🕯️' };
const HALLOWEEN_RE = /(\u200D)?(🔥|🎉|💪|🎯|🚀|💡)([\u{1F3FB}-\u{1F3FF}]|\uFE0F?\u200D)?/gu;

export function seasonText(text) {
  if (current !== 'halloween' || typeof text !== 'string') return text;
  return text.replace(HALLOWEEN_RE, (m, zwj, emoji, tail) => (zwj || tail ? m : HALLOWEEN_EMOJI[emoji]));
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
