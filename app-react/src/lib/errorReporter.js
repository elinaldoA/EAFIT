import { db } from './supabase';
import { version as APP_VERSION } from '../../package.json';
import { readClientInfo, detectDisplayMode } from './clientInfo';

// Envia erros do navegador para a tabela client_errors (lida no painel/SQL do
// admin). Sem isso, falhas só aparecem para quem usa, no console. É "melhor
// esforço": nunca lança, não reenvia o mesmo erro e para depois de poucos por
// sessão, pra um loop de erro não virar uma enxurrada de requests.
//
// Cada erro leva um `context`: onde estourou, o aparelho naquele momento e o
// rastro das últimas ações (toques em botões, telas, rede, segundo plano) —
// é o que explica um erro sem stack, como o "Script error." de extensões.
// O rastro guarda só nomes de botões e telas, nunca o que foi digitado.
const MAX_PER_SESSION = 10;
const MAX_TRAIL = 15;
const seen = new Set();
let sent = 0;
let installed = false;
const loadedAt = Date.now();
const trail = [];

function clip(value, max) {
  const s = value == null ? '' : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function uptimeSeconds() {
  return Math.round((Date.now() - loadedAt) / 1000);
}

// Uma linha no rastro: { s: segundos desde que a página abriu, e: o que houve }.
export function addBreadcrumb(text) {
  try {
    const e = clip(String(text).replace(/\s+/g, ' ').trim(), 120);
    if (!e) return;
    trail.push({ s: uptimeSeconds(), e });
    if (trail.length > MAX_TRAIL) trail.shift();
  } catch { /* rastro nunca pode causar erro */ }
}

export function buildContext({ where, componentStack } = {}) {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  return {
    ...(where ? { where: clip(where, 300) } : {}),
    ...readClientInfo(),
    display_mode: detectDisplayMode(typeof window === 'undefined' ? null : window),
    user_agent: clip(nav.userAgent, 300),
    online: nav.onLine !== false,
    lang: clip(nav.language, 20),
    screen: typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`,
    visibility: typeof document === 'undefined' ? '' : document.visibilityState,
    uptime_s: uptimeSeconds(),
    trail: trail.slice(),
    ...(componentStack ? { component_stack: clip(componentStack.trim(), 1500) } : {}),
  };
}

// `extra.where` (arquivo:linha:coluna do evento) e `extra.componentStack`
// (ErrorBoundary) entram no contexto quando existem.
export async function reportError(kind, error, extra) {
  try {
    const message = clip(error?.message || error, 500);
    if (!message) return;
    const key = `${kind}:${message}`;
    if (seen.has(key) || sent >= MAX_PER_SESSION) return;
    seen.add(key);
    sent++;
    const context = buildContext(extra);

    const { data } = await db.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return; // só usuário logado grava (RLS)

    const row = {
      user_id: userId,
      kind,
      message,
      stack: clip(error?.stack, 2000) || null,
      url: clip(window.location.pathname + window.location.hash, 300),
      app_version: APP_VERSION,
    };
    const { error: insertError } = await db.from('client_errors').insert({ ...row, context });
    // Banco ainda sem a coluna context (ou contexto recusado): grava o básico
    // em vez de perder o erro.
    if (insertError) await db.from('client_errors').insert(row);
  } catch {
    /* relatar erro nunca pode causar outro erro */
  }
}

function describeTarget(target) {
  const el = target?.closest?.('button, a, [role="button"], [role="tab"], summary, input[type="checkbox"], input[type="radio"], select');
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const label = el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.id || el.type;
    return `${clip(label.trim(), 60)} → ${el.checked ? 'marcado' : 'desmarcado'}`;
  }
  if (tag === 'select') {
    const label = el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.id || 'lista';
    return `lista ${clip(label.trim(), 60)}`;
  }
  return clip((el.getAttribute('aria-label') || el.textContent || tag).trim(), 60);
}

function describeArg(arg) {
  if (arg instanceof Error) return arg.message;
  if (typeof arg === 'string') return arg;
  try { return JSON.stringify(arg); } catch { return String(arg); }
}

function installBreadcrumbs() {
  document.addEventListener('click', e => {
    const what = describeTarget(e.target);
    if (what) addBreadcrumb(`toque: ${what}`);
  }, true);
  window.addEventListener('popstate', () => addBreadcrumb(`voltar: ${window.location.hash || '/'}`));
  window.addEventListener('hashchange', () => addBreadcrumb(`tela: ${window.location.hash || '/'}`));
  window.addEventListener('online', () => addBreadcrumb('rede: voltou'));
  window.addEventListener('offline', () => addBreadcrumb('rede: caiu'));
  document.addEventListener('visibilitychange', () => {
    addBreadcrumb(document.visibilityState === 'hidden' ? 'app em segundo plano' : 'app voltou para a tela');
  });
  // Falhas que o app trata e só registra no console (sincronização, export...)
  // costumam ser o passo anterior a um erro de verdade.
  const original = console.error;
  console.error = (...args) => {
    addBreadcrumb(`console.error: ${args.map(describeArg).join(' ')}`);
    original.apply(console, args);
  };
}

function eventLocation(e) {
  if (!e.filename) return undefined;
  return `${e.filename}:${e.lineno || 0}:${e.colno || 0}`;
}

export function installErrorReporter() {
  if (installed) return;
  installed = true;
  installBreadcrumbs();
  window.addEventListener('error', e => reportError('error', e.error || e.message, { where: eventLocation(e) }));
  window.addEventListener('unhandledrejection', e => reportError('unhandledrejection', e.reason));
}
