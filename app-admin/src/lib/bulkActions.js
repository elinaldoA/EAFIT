import { db } from './supabase';
import { callAdminAction } from './userDetailHelpers';

// Alterna um id no conjunto de selecionados sem mutar o original.
export function toggleId(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// Marca/desmarca todos os ids visíveis de uma vez: se todos já estão
// marcados, desmarca; senão marca todos (mantendo seleções de outras páginas).
export function toggleAll(selected, visibleIds) {
  const next = new Set(selected);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => next.has(id));
  for (const id of visibleIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

// Executa `fn(id)` para cada id, um de cada vez (as edge functions fazem
// chamadas à Auth API; em paralelo estouraria o rate limit). Uma falha não
// interrompe o lote: volta no relatório com o motivo.
export async function runBulk(ids, fn) {
  const failed = [];
  let ok = 0;
  for (const id of ids) {
    try {
      await fn(id);
      ok++;
    } catch (err) {
      failed.push({ id, message: err?.message || String(err) });
    }
  }
  return { ok, failed };
}

export function bulkAction(action, ids) {
  return runBulk(ids, id => callAdminAction(action, id));
}

export async function bulkNotify(ids, { title, body }) {
  const { data, error } = await db.functions.invoke('admin-broadcast', {
    body: { title, body, targetUserIds: ids },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function summarize({ ok, failed }, verb) {
  if (failed.length === 0) return `${verb}: ${ok} usuário(s).`;
  return `${verb}: ${ok} ok, ${failed.length} com erro (${failed[0].message}).`;
}
