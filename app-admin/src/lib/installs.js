import { db } from './supabase';
import { OS_LABELS } from './behavior';

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
