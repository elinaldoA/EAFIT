import { db } from './supabase';

export const PAGE_SIZE = 50;

export const KIND_LABELS = {
  error: 'Exceção',
  unhandledrejection: 'Promise rejeitada',
  boundary: 'Tela de erro',
};

// Erros enviados pelo app (tabela client_errors; só admin lê — ver RLS).
export async function fetchClientErrors({ page = 0, pageSize = PAGE_SIZE } = {}) {
  const from = page * pageSize;
  const { data, error, count } = await db
    .from('client_errors')
    .select('id, user_id, kind, message, stack, url, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
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
