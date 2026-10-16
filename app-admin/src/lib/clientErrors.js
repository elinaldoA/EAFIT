import { db } from './supabase';

export const PAGE_SIZE = 50;

export const KIND_LABELS = {
  error: 'Exceção',
  unhandledrejection: 'Promise rejeitada',
  boundary: 'Tela de erro',
};

const BASE_COLUMNS = 'id, user_id, kind, message, stack, url, created_at';

function queryErrors(columns, from, pageSize) {
  return db
    .from('client_errors')
    .select(columns, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
}

// Erros enviados pelo app (tabela client_errors; só admin lê — ver RLS).
// Banco ainda sem a coluna context (migration 20261110010000 não aplicada,
// erro 42703): lista sem ela em vez de quebrar a página.
export async function fetchClientErrors({ page = 0, pageSize = PAGE_SIZE } = {}) {
  const from = page * pageSize;
  let { data, error, count } = await queryErrors(`${BASE_COLUMNS}, app_version, context`, from, pageSize);
  if (error?.code === '42703') ({ data, error, count } = await queryErrors(BASE_COLUMNS, from, pageSize));
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

const DISPLAY_LABELS = { standalone: 'app instalado', browser: 'navegador' };

// Resumo do aparelho numa linha: "0.3.4 · ios · safari · celular · navegador · offline".
export function describeDevice(row) {
  const c = row.context || {};
  return [
    row.app_version || c.app_version,
    c.os, c.browser, c.device,
    DISPLAY_LABELS[c.display_mode] || c.display_mode,
    c.online === false && 'offline',
    c.visibility === 'hidden' && 'em segundo plano',
  ].filter(Boolean).join(' · ');
}

// Segundos desde que a página abriu, legível: 42s, 3min 05s, 1h 02min.
export function formatUptime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}min`;
}

// Apaga os erros anteriores a `days` dias (padrão 30) e devolve quantos eram.
export async function purgeOldClientErrors(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await db
    .from('client_errors')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (error) throw error;
  return count ?? 0;
}
