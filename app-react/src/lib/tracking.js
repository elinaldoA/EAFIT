import { db } from './supabase';
import { todayDate } from '../data/treinoData';
import { lang } from './i18n';
import { readClientInfo, detectDisplayMode } from './clientInfo';
import { version as APP_VERSION } from '../../package.json';

// Métricas de uso pro painel admin (Análises → Comportamento). Tabelas e
// funções em supabase/migrations/20261027010000_behavior_tracking.sql.
//
// Regras: nada aqui pode atrapalhar o app (toda falha é engolida) e nada é
// enviado duas vezes à toa — eventos do usuário logado contam no máximo 1 vez
// por dia, eventos anônimos da tela de acesso 1 vez por sessão do navegador.
//
// Fica desligado até enableTracking() (chamado em main.jsx): módulos e testes
// que importam as libs não disparam rede só por isso.

let enabled = false;
let userId = null;
let seen = { day: '', keys: new Set() };

export function enableTracking() { enabled = true; }

export function setTrackingUser(id) {
  userId = id || null;
  seen = { day: '', keys: new Set() };
}

const EVENT_RE = /^[a-z0-9_]{1,30}$/;
const DETAIL_RE = /^[a-z0-9_-]{0,40}$/;

// Aceita "weak_password", "Signup Disabled" etc. e devolve no formato do banco.
export function cleanDetail(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function storageKey() { return `eafit_events_${userId}`; }

// Carrega o que já foi enviado hoje (sobrevive a recarregar a página).
function loadSeen(today) {
  if (seen.day === today) return;
  seen = { day: today, keys: new Set() };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    if (saved?.day === today && Array.isArray(saved.keys)) seen.keys = new Set(saved.keys);
  } catch { /* sem armazenamento ou valor inválido: conta de novo, o banco deduplica */ }
}

function saveSeen() {
  try { localStorage.setItem(storageKey(), JSON.stringify({ day: seen.day, keys: [...seen.keys] })); } catch { /* sem armazenamento */ }
}

// Evento do usuário logado: no máximo 1 por dia por evento+detalhe.
export function trackEvent(event, detail = '') {
  if (!enabled || !userId) return false;
  const d = cleanDetail(detail);
  if (!EVENT_RE.test(event) || !DETAIL_RE.test(d)) return false;
  try {
    loadSeen(todayDate());
    const key = `${event}:${d}`;
    if (seen.keys.has(key)) return false;
    seen.keys.add(key);
    saveSeen();
    Promise.resolve(db.rpc('track_event', { p_event: event, p_detail: d })).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export const trackFeature = name => trackEvent('feature', name);

function pushPermission() {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  } catch {
    return 'unsupported';
  }
}

// Retrato do acesso (sistema, navegador, instalado ou não, versão…): 1 vez por
// dia, ou de novo no mesmo dia se algo mudou (ex.: instalou o app, permitiu
// notificações).
export function trackClient() {
  if (!enabled || !userId) return false;
  try {
    const info = {
      ...readClientInfo(),
      display_mode: detectDisplayMode(typeof window === 'undefined' ? null : window),
      app_version: APP_VERSION,
      lang,
      push_permission: pushPermission(),
    };
    const stamp = `${todayDate()}|${Object.values(info).join('|')}`;
    const key = `eafit_client_${userId}`;
    try {
      if (localStorage.getItem(key) === stamp) return false;
      localStorage.setItem(key, stamp);
    } catch { /* sem armazenamento: envia mesmo assim */ }
    Promise.resolve(db.rpc('track_client', {
      p_os: info.os, p_browser: info.browser, p_device: info.device, p_display_mode: info.display_mode,
      p_app_version: info.app_version, p_lang: info.lang, p_push_permission: info.push_permission,
    })).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

const AUTH_EVENTS = ['signup_start', 'signup_submit', 'signup_error', 'signup_ok', 'login_error'];

// Evento anônimo da tela de acesso: 1 por sessão do navegador por evento+detalhe.
export function trackAuthEvent(event, detail = '') {
  if (!enabled || !AUTH_EVENTS.includes(event)) return false;
  const d = cleanDetail(detail);
  try {
    const key = `eafit_auth_${event}_${d}`;
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, '1');
    } catch { /* sem armazenamento: envia mesmo assim */ }
    Promise.resolve(db.from('auth_events').insert({ event, detail: d })).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// O service worker marca a URL com ?push=1 quando abre o app por uma
// notificação (ou avisa por mensagem se o app já estava aberto). A marca sai
// da barra de endereço pra não contar de novo ao recarregar.
let pendingPushOpen = false;

export function capturePushOpen(win = typeof window === 'undefined' ? null : window) {
  if (!win) return;
  try {
    const url = new URL(win.location.href);
    if (url.searchParams.has('push')) {
      pendingPushOpen = true;
      url.searchParams.delete('push');
      win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
    }
    win.navigator?.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type !== 'eafit-push-open') return;
      if (!trackEvent('push', 'open')) pendingPushOpen = true;
    });
  } catch { /* URL ou history indisponíveis */ }
}

// Chamado quando o usuário fica conhecido: só aí dá pra gravar a abertura.
export function flushPushOpen() {
  if (!pendingPushOpen || !userId) return;
  pendingPushOpen = false;
  trackEvent('push', 'open');
}
