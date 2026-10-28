import { db } from './supabase';
import { OS_LABELS, BROWSER_LABELS } from './behavior';

// Instalações e indícios de desinstalação (Dashboard → Instalações). RPCs em
// supabase/migrations/20261107010000_app_installs.sql; quem grava é
// app-react/src/lib/tracking.js (trackInstall) e, nas desinstalações, as Edge
// Functions de push (push_drop_stale).

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export async function fetchInstallSummary(days = 30) {
  return (await rpcRows('admin_install_summary', { days_back: days }))[0] || null;
}
export const fetchInstallDaily = (days = 30) => rpcRows('admin_install_daily', { days_back: days });
export const fetchInstallByOs = (days = 30) => rpcRows('admin_install_by_os', { days_back: days });
export const fetchPushStaleRecent = (max = 20) => rpcRows('admin_push_stale_recent', { max_rows: max });
export const fetchInstallByBrowser = (days = 30) => rpcRows('admin_install_by_browser', { days_back: days });
export const fetchInstallByOrigin = (days = 30) => rpcRows('admin_install_by_origin', { days_back: days });
export const fetchInstallRetention = (days = 30) => rpcRows('admin_install_retention', { days_back: days });
export const fetchInstallDevices = (kind = 'recent', max = 20) => rpcRows('admin_install_devices', { p_kind: kind, max_rows: max });
export async function fetchInstallCompare(days = 30) {
  return (await rpcRows('admin_install_compare', { days_back: days }))[0] || null;
}

export const PLATFORM_LABELS = { android: 'Android', ios: 'iPhone/iPad', windows: 'Computador', firefox: 'Firefox', outro: 'Outro' };

const num = v => Number(v) || 0;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// Resumo da RPC → números da tela, com as taxas da tela "Instale o app".
export function buildInstallSummary(s) {
  if (!s) return null;
  const shown = num(s.screen_shown);
  const accepted = num(s.prompt_accepted);
  const dismissed = num(s.prompt_dismissed);
  return {
    installs: num(s.installs),
    firstOpens: num(s.first_opens),
    installedTotal: num(s.installed_total),
    active30: num(s.active_30d),
    inactive30: num(s.inactive_30d),
    pushStale: num(s.push_stale),
    screen: { shown, accepted, dismissed, acceptedPct: pct(accepted, accepted + dismissed) },
    sources: [
      { key: 'prompt', label: 'Botão "Instalar app"', total: num(s.installs_prompt) },
      { key: 'browser', label: 'Menu do navegador', total: num(s.installs_browser) },
      { key: 'icon', label: 'Detectado ao abrir pelo ícone (iPhone e outros)', total: num(s.installs_icon) },
    ],
  };
}

export function buildByOs(rows) {
  return (rows || []).map(r => ({
    os: r.os,
    label: OS_LABELS[r.os] || r.os,
    installedTotal: num(r.installed_total),
    installs: num(r.installs),
    active30: num(r.active_30d),
    pushStale: num(r.push_stale),
    stalePct: pct(num(r.push_stale), num(r.installed_total)),
  }));
}

export function buildByBrowser(rows) {
  return (rows || []).map(r => ({
    browser: r.browser,
    label: BROWSER_LABELS[r.browser] || r.browser,
    installedTotal: num(r.installed_total),
    installs: num(r.installs),
    active30: num(r.active_30d),
  }));
}

export const SOURCE_LABELS = { sem_conta: 'Aparelho sem conta', sem_origem: 'Conta sem origem', direto: 'Direto' };

export function buildByOrigin(rows) {
  const list = (rows || []).map(r => ({
    source: r.source, label: SOURCE_LABELS[r.source] || r.source, installs: num(r.installs), active30: num(r.active_30d),
  }));
  const total = list.reduce((sum, r) => sum + r.installs, 0);
  return list.map(r => ({ ...r, pct: pct(r.installs, total) ?? 0 }));
}

// Valores do período anterior (mesmo formato de buildInstallSummary, só o que se compara).
export function buildInstallCompare(c) {
  if (!c) return null;
  const accepted = num(c.prompt_accepted);
  const dismissed = num(c.prompt_dismissed);
  return {
    installs: num(c.installs),
    firstOpens: num(c.first_opens),
    pushStale: num(c.push_stale),
    shown: num(c.screen_shown),
    accepted,
    dismissed,
  };
}

// Funil: viram a tela → aceitaram → instalaram → abriram pelo ícone → seguem em uso.
// Cada etapa traz o % sobre a anterior (os números vêm de eventos do período, não
// da mesma coorte, então o % pode passar de 100).
export function buildFunnel(summary, retention) {
  if (!summary) return [];
  const steps = [
    { key: 'shown', label: 'Viram a tela "Instale o app"', total: summary.screen.shown },
    { key: 'accepted', label: 'Aceitaram o botão', total: summary.screen.accepted },
    { key: 'installs', label: 'Instalaram', total: summary.installs },
    { key: 'opened', label: 'Abriram pelo ícone', total: summary.firstOpens },
  ];
  const r7 = retention?.returns.find(r => r.days === 7);
  const r30 = retention?.returns.find(r => r.days === 30);
  if (r7 && r7.base > 0) steps.push({ key: 'r7', label: 'Seguiam abrindo 7 dias depois', total: r7.total, base: r7.base });
  if (r30 && r30.base > 0) steps.push({ key: 'r30', label: 'Seguiam abrindo 30 dias depois', total: r30.total, base: r30.base });
  return steps.map((s, i) => ({
    ...s,
    pct: s.base != null ? pct(s.total, s.base) : i === 0 ? null : pct(s.total, steps[i - 1].total),
  }));
}

const DAYS_LABELS = { 0: 'Nunca abriu pelo ícone', 1: '1 dia', 2: '2 a 3 dias', 4: '4 a 7 dias', 8: '8 a 15 dias', 16: '16 dias ou mais' };

// Retorno por idade (1, 7, 30 dias) e distribuição dos dias de uso.
export function buildRetention(rows) {
  const list = rows || [];
  const returns = list.filter(r => r.kind === 'return')
    .map(r => ({ days: num(r.bucket), total: num(r.total), base: num(r.base), pct: pct(num(r.total), num(r.base)) }));
  const dist = list.filter(r => r.kind === 'days').map(r => ({ key: num(r.bucket), label: DAYS_LABELS[num(r.bucket)] || `${r.bucket}+`, total: num(r.total), base: num(r.base) }));
  const base = dist[0]?.base || 0;
  return {
    returns,
    distribution: dist.map(d => ({ ...d, pct: pct(d.total, base) ?? 0 })),
    hasData: returns.some(r => r.base > 0) || base > 0,
  };
}

export const SOURCE_NAMES = { prompt: 'Botão "Instalar app"', browser: 'Menu do navegador', icon: 'Pelo ícone', anterior: 'Já instalado antes' };

export function buildDevices(rows) {
  return (rows || []).map(r => ({
    installedAt: r.installed_at,
    os: OS_LABELS[r.os] || r.os,
    browser: BROWSER_LABELS[r.browser] || r.browser,
    source: SOURCE_NAMES[r.install_source] || r.install_source || '—',
    openDays: num(r.open_days),
    lastOpen: r.last_open_on,
    userId: r.user_id,
    name: r.nome || r.email || null,
  }));
}

// Só os dias com alguma instalação ou desinstalação, do mais recente pro mais antigo.
export function activeDays(rows) {
  return (rows || [])
    .map(r => ({ day: r.day, installs: num(r.installs), pushStale: num(r.push_stale) }))
    .filter(r => r.installs || r.pushStale)
    .reverse();
}

// "2026-10-15" (data) ou data/hora (no fuso de Brasília) → "15/10/2026".
export function formatDay(value) {
  if (!value) return '—';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/');
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
