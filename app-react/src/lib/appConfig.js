import { db } from './supabase';

// Configurações controladas pelo painel admin (tabela app_settings): modo
// manutenção, aviso no app e chaves de recursos. Tudo aqui é fail-open: se a
// leitura falhar ou vier torta, o app segue normal em vez de bloquear.
export const DEFAULT_CONFIG = {
  maintenance: { enabled: false, message: '' },
  banner: { enabled: false, message: '', level: 'info', linkUrl: '', linkLabel: '', version: 0 },
  flags: {},
  moved: { enabled: false, url: '' },
};

const BANNER_LEVELS = ['info', 'warning', 'success'];
const FETCH_TIMEOUT_MS = 4000;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : '');

// Hoje no fuso do app (America/Sao_Paulo), em YYYY-MM-DD.
export function todayInAppZone(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

// Período do aviso (definido no painel admin): fora dele, o aviso não aparece.
export function inBannerWindow(startsOn, endsOn, today = todayInAppZone()) {
  return (!startsOn || today >= startsOn) && (!endsOn || today <= endsOn);
}

// Só aceita link absoluto http(s) ou caminho relativo — nada de javascript:.
export function safeLink(url) {
  const u = str(url);
  return /^(https?:\/\/|\/)/i.test(u) ? u : '';
}

export function normalizeConfig(rows, today = todayInAppZone()) {
  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value && typeof r.value === 'object' ? r.value : {}]));
  const m = map.maintenance || {};
  const b = map.banner || {};
  const flags = {};
  for (const [k, v] of Object.entries(map.flags || {})) {
    if (typeof v === 'boolean') flags[k] = v;
  }
  const bannerMessage = str(b.message);
  const mv = map.moved || {};
  const movedUrl = /^https:\/\//i.test(str(mv.url)) ? str(mv.url) : '';
  return {
    maintenance: { enabled: m.enabled === true, message: str(m.message) },
    banner: {
      enabled: b.enabled === true && bannerMessage !== '' && inBannerWindow(day(b.startsOn), day(b.endsOn), today),
      message: bannerMessage,
      level: BANNER_LEVELS.includes(b.level) ? b.level : 'info',
      linkUrl: safeLink(b.linkUrl),
      linkLabel: str(b.linkLabel),
      version: Number.isFinite(Number(b.version)) ? Number(b.version) : 0,
    },
    flags,
    moved: { enabled: mv.enabled === true && movedUrl !== '', url: movedUrl },
  };
}

// Mudança de endereço ligada no painel admin: devolve o endereço novo só pra
// quem ainda está no antigo (quem já abriu o novo, ou está em dev, segue normal).
export function movedTarget(moved, hostname = window.location.hostname) {
  if (!moved?.enabled || hostname === 'localhost') return '';
  try {
    return new URL(moved.url).hostname === hostname ? '' : moved.url;
  } catch {
    return '';
  }
}

// Recurso sem chave definida conta como ligado.
export function isFlagOn(flags, name) {
  return flags?.[name] !== false;
}

export async function fetchAppConfig() {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS));
  const { data, error } = await Promise.race([db.from('app_settings').select('key, value'), timeout]);
  if (error) throw error;
  return normalizeConfig(data);
}

const DISMISSED_KEY = 'eafit_banner_dismissed';

export function isBannerDismissed(version) {
  try { return localStorage.getItem(DISMISSED_KEY) === String(version); } catch { return false; }
}

export function dismissBanner(version) {
  try { localStorage.setItem(DISMISSED_KEY, String(version)); } catch { /* armazenamento bloqueado */ }
}
