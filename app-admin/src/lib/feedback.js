import { db } from './supabase';

export const PAGE_SIZE = 50;

export const KIND_LABELS = { sugestao: '💡 Sugestão', problema: '🐞 Problema', elogio: '❤️ Elogio' };
export const KIND_BADGE = { sugestao: 'badge--admin', problema: 'badge--danger', elogio: 'badge--ok' };

export const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'resolvido', label: 'Resolvido' },
];
export const STATUS_BADGE = { novo: 'badge--warning', em_andamento: 'badge--admin', resolvido: 'badge--ok' };

export async function fetchFeedback({ status = '', kind = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  const { data, error } = await db.rpc('admin_list_feedback', {
    status_filter: status || null,
    kind_filter: kind || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  const rows = data || [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), novos: Number(rows[0]?.novos ?? 0) };
}

// Quantos feedbacks novos esperam resposta (0 se não houver ou se falhar).
export async function fetchNewFeedbackCount() {
  try {
    const { novos } = await fetchFeedback({ status: 'novo', pageSize: 1 });
    return novos;
  } catch {
    return 0;
  }
}

export async function updateFeedback(id, fields) {
  const { error } = await db.from('feedback').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteFeedback(id) {
  const { error } = await db.from('feedback').delete().eq('id', id);
  if (error) throw error;
}

// A nota só é salva se mudou, e vazia vira null (limpa a nota).
export function noteChanged(saved, draft) {
  return (saved || '').trim() !== (draft || '').trim();
}

export function noteValue(draft) {
  const v = (draft || '').trim();
  return v === '' ? null : v;
}
