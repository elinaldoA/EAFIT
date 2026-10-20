import { db } from './supabase';
import { normalizeSeason } from './season';

// Configurações controladas pelo painel admin (tabela app_settings): modo
// manutenção, aviso no app e chaves de recursos. Tudo aqui é fail-open: se a
// leitura falhar ou vier torta, o app segue normal em vez de bloquear.
export const DEFAULT_CONFIG = {
  maintenance: { enabled: false, message: '' },
  banner: { enabled: false, message: '', level: 'info', linkUrl: '', linkLabel: '', version: 0 },
  flags: {},
  moved: { enabled: false, url: '' },
  // Tema de temporada (lib/season.js). Literal aqui: season.js importa deste arquivo.
  season: { enabled: false, periods: [] },
  // Experimentos rodando para quem está logado: { chave: variante } (useExperiment).
  experiments: {},
  // Versão mínima do app (painel → Configurações): 'warn' mostra faixa, 'block' tela cheia.
  minVersion: { version: '', mode: 'warn', message: '' },
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

// Experimentos do painel (Sistema → Experimentos), já sorteados no banco
// (my_experiments). Liberação gradual sobrepõe a chave de recurso: variante
// 'on' liga, 'off' desliga — assim todo isFlagOn respeita o percentual.
export function applyExperiments(flags, rows) {
  const out = { ...flags };
  const experiments = {};
  for (const r of rows || []) {
    if (!r || typeof r.key !== 'string' || typeof r.variant !== 'string') continue;
    experiments[r.key] = r.variant;
    if (typeof r.flag === 'string' && r.flag && (r.variant === 'on' || r.variant === 'off')) out[r.flag] = r.variant === 'on';
  }
  return { flags: out, experiments };
}

export function normalizeConfig(rows, today = todayInAppZone(), experimentRows = []) {
  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value && typeof r.value === 'object' ? r.value : {}]));
  const m = map.maintenance || {};
  const b = map.banner || {};
  const flags = {};
  for (const [k, v] of Object.entries(map.flags || {})) {
    if (typeof v === 'boolean') flags[k] = v;
  }
  const applied = applyExperiments(flags, experimentRows);
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
    flags: applied.flags,
    moved: { enabled: mv.enabled === true && movedUrl !== '', url: movedUrl },
    season: normalizeSeason(map.season),
    experiments: applied.experiments,
    minVersion: {
      version: /^\d+(\.\d+){0,2}$/.test(str(map.min_version?.version)) ? str(map.min_version.version) : '',
      mode: map.min_version?.mode === 'block' ? 'block' : 'warn',
      message: str(map.min_version?.message),
    },
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

// Aviso cujo link (absoluto) aponta pra página onde a pessoa já está não tem o
// que mostrar — ex.: "mudamos de endereço" visto por quem já abriu o novo.
export function linksToHere(url, loc = window.location) {
  if (!/^https?:\/\//i.test(url || '')) return false;
  try {
    const target = new URL(url);
    return target.origin === loc.origin && target.pathname === loc.pathname && !target.hash;
  } catch {
    return false;
  }
}

// Recurso sem chave definida conta como ligado.
export function isFlagOn(flags, name) {
  return flags?.[name] !== false;
}

export async function fetchAppConfig() {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS));
  const [settings, experiments] = await Promise.all([
    Promise.race([db.from('app_settings').select('key, value'), timeout]),
    // Sem login (ou função ainda não criada) = sem experimentos; nunca derruba a configuração.
    Promise.race([Promise.resolve(db.rpc('my_experiments')), timeout]).catch(() => null),
  ]);
  if (settings.error) throw settings.error;
  return normalizeConfig(settings.data, todayInAppZone(), experiments && !experiments.error ? experiments.data : []);
}

const DISMISSED_KEY = 'eafit_banner_dismissed';

export function isBannerDismissed(version) {
  try { return localStorage.getItem(DISMISSED_KEY) === String(version); } catch { return false; }
}

export function dismissBanner(version) {
  try { localStorage.setItem(DISMISSED_KEY, String(version)); } catch { /* armazenamento bloqueado */ }
}
