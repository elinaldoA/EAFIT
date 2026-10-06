import { db } from './supabase';
import { fetchUsersPage } from './users';

export const STATUS_LABELS = {
  active: 'Ativos', admin: 'Admins', banned: 'Banidos', unconfirmed: 'Não confirmados',
  inactive: 'Inativos (14+ dias sem treinar)', never_trained: 'Nunca treinaram',
};

// Só guarda o que de fato filtra: filtro vazio não entra no segmento.
export function cleanFilters({ search, status, nivel, meta } = {}) {
  const out = {};
  if (search?.trim()) out.search = search.trim();
  if (status) out.status = status;
  if (nivel) out.nivel = nivel;
  if (meta) out.meta = meta;
  return out;
}

export function hasFilters(filters) {
  return Object.keys(cleanFilters(filters)).length > 0;
}

// Texto curto com os critérios, pra listar o segmento sem abrir.
export function describeFilters(filters) {
  const f = cleanFilters(filters);
  const parts = [];
  if (f.status) parts.push(STATUS_LABELS[f.status] || f.status);
  if (f.nivel) parts.push(`nível ${f.nivel}`);
  if (f.meta) parts.push(`objetivo ${f.meta}`);
  if (f.search) parts.push(`busca "${f.search}"`);
  return parts.length ? parts.join(' · ') : 'todos os usuários';
}

export async function fetchSegments() {
  const { data, error } = await db.from('user_segments')
    .select('id, name, description, filters, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSegment({ name, description = '', filters, adminId }) {
  const { error } = await db.from('user_segments').insert({
    name: name.trim(), description: description.trim(), filters: cleanFilters(filters), created_by: adminId,
  });
  if (error) throw error;
}

export async function deleteSegment(id) {
  const { error } = await db.from('user_segments').delete().eq('id', id);
  if (error) throw error;
}

// Quantos usuários o segmento pega hoje (consulta de 1 linha, só o total).
export async function countSegment(segment) {
  const { total } = await fetchUsersPage({ ...cleanFilters(segment.filters), page: 0, pageSize: 1 });
  return Number(total);
}

// IDs dos usuários do segmento hoje (base inteira, mesmo teto da exportação).
export async function resolveSegment(segment) {
  const { rows } = await fetchUsersPage({ ...cleanFilters(segment.filters), page: 0, pageSize: 10000 });
  return rows.map(r => r.id);
}
