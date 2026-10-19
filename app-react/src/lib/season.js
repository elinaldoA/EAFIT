// Tema de temporada (ex.: Dia das Bruxas): decoração leve no app e no site,
// agendada no painel admin (app_settings, chave "season") como uma lista de
// períodos, um tema em cada, e o app passa de um para o outro sozinho.
// Fora dos períodos a decoração some sozinha, mesmo em app antigo em cache.
// A pessoa pode desligar no Perfil (vale por aparelho e por tema).
// O site lê a mesma chave em public/landing/assets/site.js.

// Hoje no fuso do app, em YYYY-MM-DD (igual a todayInAppZone de appConfig.js,
// que importa deste arquivo).
export function seasonToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export const SEASONS = {
  outubro_rosa: { emoji: '💗' },
  halloween: { emoji: '🎃' },
  novembro_azul: { emoji: '💙' },
};

// season: { enabled, periods: [{ theme, startsOn, endsOn }] }
export const DEFAULT_SEASON = { enabled: false, periods: [] };

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function normalizePeriod(p) {
  if (!p || typeof p !== 'object' || !Object.hasOwn(SEASONS, p.theme)) return null;
  return { theme: p.theme, startsOn: isDay(p.startsOn) ? p.startsOn : '', endsOn: isDay(p.endsOn) ? p.endsOn : '' };
}

// Aceita também o formato antigo, de um tema só ({ enabled, theme, startsOn,
// endsOn }), que vira um período. Tema desconhecido (de versão mais nova do
// painel) é ignorado.
export function normalizeSeason(value) {
  const v = value && typeof value === 'object' ? value : {};
  const list = Array.isArray(v.periods) ? v.periods : (v.theme ? [v] : []);
  const periods = list.map(normalizePeriod).filter(Boolean);
  return { enabled: v.enabled === true && periods.length > 0, periods };
}

// Período no ar hoje, ou null. Sem as duas datas não liga: decoração esquecida
// ligada para sempre é justamente o que este limite evita.
export function activePeriod(season, today = seasonToday()) {
  if (!season?.enabled) return null;
  return (season.periods || []).find(p => p.startsOn && p.endsOn && today >= p.startsOn && today <= p.endsOn) || null;
}

// Tema no ar hoje, ou ''.
export function activeSeason(season, today = seasonToday()) {
  return activePeriod(season, today)?.theme || '';
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

// Ícone da aba do navegador: abóbora no Dia das Bruxas, laço rosa ou azul nas
// campanhas de saúde.
const HALLOWEEN_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M32 16c1-6 5-9 9-9' stroke='%2316a34a' stroke-width='5' fill='none' stroke-linecap='round'/%3E%3Cellipse cx='20' cy='38' rx='14' ry='20' fill='%23ea580c'/%3E%3Cellipse cx='44' cy='38' rx='14' ry='20' fill='%23ea580c'/%3E%3Cellipse cx='32' cy='38' rx='14' ry='21' fill='%23f97316'/%3E%3Cpath d='M17 29l9 6-10 2zM47 29l-9 6 10 2z' fill='%23fde047'/%3E%3Cpath d='M18 45q14 9 28 0l-4 5-4-3-4 4-4-4-4 3z' fill='%23fde047'/%3E%3C/svg%3E";
const NOVEMBRO_AZUL_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M22 58 38 30c5-9 3-22-6-22s-11 13-6 22l16 28' fill='none' stroke='%232563eb' stroke-width='9' stroke-linejoin='round'/%3E%3Cpath d='M38 30c5-9 3-22-6-22' fill='none' stroke='%2360a5fa' stroke-width='9'/%3E%3C/svg%3E";
const OUTUBRO_ROSA_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M22 58 38 30c5-9 3-22-6-22s-11 13-6 22l16 28' fill='none' stroke='%23db2777' stroke-width='9' stroke-linejoin='round'/%3E%3Cpath d='M38 30c5-9 3-22-6-22' fill='none' stroke='%23f9a8d4' stroke-width='9'/%3E%3C/svg%3E";
const SEASON_FAVICON = { outubro_rosa: OUTUBRO_ROSA_FAVICON, halloween: HALLOWEEN_FAVICON, novembro_azul: NOVEMBRO_AZUL_FAVICON };
const SEASON_COLOR = { outubro_rosa: '#170c14', halloween: '#120c1a', novembro_azul: '#0b1220' };
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
  if (icon) icon.setAttribute('href', SEASON_FAVICON[theme] || original.icon);
}

// Antes do primeiro render (main.jsx): tema guardado, se ainda no período.
export function bootSeason() {
  const theme = activeSeason(cachedSeason());
  applySeason(theme && !isSeasonOff(theme) ? theme : '');
}

// Emojis decorativos dos textos do app trocados no tema (t() em lib/i18n.js).
// Só os de enfeite: avisos, status e carinhas de humor ficam. Emoji dentro de
// sequência (🧑‍🏫) ou com tom de pele fica como está. As campanhas de saúde
// trocam pouco: só o fogo e a festa ganham a cor do laço.
const SEASON_EMOJI = {
  outubro_rosa: { '🔥': '💗', '🎉': '💗' },
  halloween: { '🔥': '🎃', '🎉': '👻', '💪': '🦇', '🎯': '🔮', '🚀': '🧹', '💡': '🕯️' },
  novembro_azul: { '🔥': '💙', '🎉': '💙' },
};
const SEASON_EMOJI_RE = Object.fromEntries(Object.entries(SEASON_EMOJI).map(([theme, map]) =>
  [theme, new RegExp(`(\u200D)?(${Object.keys(map).join('|')})([\u{1F3FB}-\u{1F3FF}]|\uFE0F?\u200D)?`, 'gu')]));

export function seasonText(text) {
  const map = SEASON_EMOJI[current];
  if (!map || typeof text !== 'string') return text;
  return text.replace(SEASON_EMOJI_RE[current], (m, zwj, emoji, tail) => (zwj || tail ? m : map[emoji]));
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

// Treinos em dias diferentes dentro de { from, to } (YYYY-MM-DD, inclusive).
export function workoutDaysIn(completedDates, { from, to }) {
  return new Set((completedDates || []).filter(d => d >= from && d <= to)).size;
}

// Conquistas das campanhas de saúde: X treinos (dias diferentes) na janela do
// ano. Mesmo esquema do Dia das Bruxas: datas fixas por ano, fora do período
// do painel.
//   Outubro Rosa: 10 treinos de 01/10 a 23/10 (até a véspera do Dia das
//     Bruxas). A primeira edição entrou no ar em 19/10/2026, então nesse ano
//     vale 3 treinos de 19/10 a 23/10.
//   Novembro Azul: 12 treinos em novembro (uns 3 por semana).
export const FIRST_OUTUBRO_ROSA_YEAR = 2026;
export const FIRST_NOVEMBRO_AZUL_YEAR = 2026;

export function outubroRosaWindow(year) {
  if (year === 2026) return { from: '2026-10-19', to: '2026-10-23', goal: 3 };
  return { from: `${year}-10-01`, to: `${year}-10-23`, goal: 10 };
}

export function novembroAzulWindow(year) {
  return { from: `${year}-11-01`, to: `${year}-11-30`, goal: 12 };
}

export function earnedOutubroRosa(completedDates, year) {
  const w = outubroRosaWindow(year);
  return workoutDaysIn(completedDates, w) >= w.goal;
}

export function earnedNovembroAzul(completedDates, year) {
  const w = novembroAzulWindow(year);
  return workoutDaysIn(completedDates, w) >= w.goal;
}
