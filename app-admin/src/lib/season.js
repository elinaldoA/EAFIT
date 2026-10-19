import { db } from './supabase';
import { normalizeSettings, seasonStatus } from './appSettings';
import { todayStr } from './community';

// Tema de temporada também no painel: o mesmo tema do dia que o app e o site
// mostram (src/season.css). Cada admin pode desligar no navegador dele.
const OFF_KEY = 'eafit_admin_season_off';
export const SEASON_CHANGE_EVENT = 'eafit-admin-season-change';

const EMOJI = {
  carnaval: '🎭', pascoa: '🐰', namorados: '💕', festa_junina: '🌽', outubro_rosa: '💗',
  halloween: '🎃', novembro_azul: '💙', natal: '🎄', ano_novo: '🎆',
};

export function isAdminSeasonOff() {
  try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; }
}

export function setAdminSeasonOff(off) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch { /* armazenamento bloqueado */ }
  window.dispatchEvent(new Event(SEASON_CHANGE_EVENT));
}

// Tema no ar hoje pela chave "season" já normalizada, ou ''.
export function liveTheme(season, today = todayStr()) {
  return seasonStatus(season, today).theme || '';
}

export async function fetchSeason() {
  const { data, error } = await db.from('app_settings').select('key, value').eq('key', 'season');
  if (error) throw error;
  return normalizeSettings(data).season;
}

let originalIcon;

// <html data-season> (src/season.css) e o emoji do tema no favicon.
export function applyAdminSeason(theme) {
  const root = document.documentElement;
  if (theme) root.setAttribute('data-season', theme);
  else root.removeAttribute('data-season');
  const icon = document.querySelector('link[rel="icon"]');
  if (!icon) return;
  if (originalIcon === undefined) originalIcon = icon.getAttribute('href');
  icon.setAttribute('href', theme
    ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${EMOJI[theme]}</text></svg>`)}`
    : originalIcon);
}
