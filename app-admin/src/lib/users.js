import { db } from './supabase';
import { fetchAllRows } from './paged';

export const PAGE_SIZE = 50;

// Lista SEM paginação — usada pelo picklist de destinatários do Broadcast,
// que precisa da base inteira, não de uma página de cada vez.
export async function fetchUsers() {
  const { data, error } = await db.rpc('admin_list_users');
  if (error) throw error;
  return data || [];
}

// Ids das contas desativadas pelo admin. A lista paginada só traz
// banned_until, que também fica preenchido no banimento — é esta consulta que
// separa "desativado" de "banido". Falha aqui não derruba a lista.
export async function fetchDeactivatedIds() {
  try {
    const rows = await fetchAllRows(() => db.from('account_deactivations').select('user_id').order('user_id'));
    return new Set(rows.map(r => r.user_id));
  } catch {
    return new Set();
  }
}

// Provedores de login (google, email...) das contas da página: id -> lista.
// Falha aqui não derruba a lista; a coluna só fica sem a informação.
export async function fetchProviders(ids) {
  try {
    if (!ids.length) return new Map();
    const { data, error } = await db.rpc('admin_user_providers', { p_ids: ids });
    if (error) throw error;
    return new Map((data || []).map(r => [r.up_id, r.up_providers || []]));
  } catch {
    return new Map();
  }
}

// País (ISO-2) das contas da página: id -> 'BR'. Falha não derruba a lista.
export async function fetchCountries(ids) {
  try {
    if (!ids.length) return new Map();
    const { data, error } = await db.rpc('admin_user_countries', { p_ids: ids });
    if (error) throw error;
    return new Map((data || []).map(r => [r.uco_id, r.uco_country]));
  } catch {
    return new Map();
  }
}

// Contas por país na base inteira: [{ country: 'BR'|null, users }].
export async function fetchCountrySummary() {
  try {
    const { data, error } = await db.rpc('admin_users_by_country');
    if (error) throw error;
    return (data || []).map(r => ({ country: r.ubc_country, users: Number(r.ubc_users) }));
  } catch {
    return [];
  }
}

export async function fetchUsersPage({ search = '', status = '', sort = '', nivel = '', meta = '', country = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  const { data, error } = await db.rpc('admin_list_users_page', {
    search: search || null,
    status_filter: status || null,
    page_size: pageSize,
    page_offset: page * pageSize,
    sort_by: sort || 'created_desc',
    nivel_filter: nivel || null,
    meta_filter: meta || null,
    ...(country ? { country_filter: country } : {}),
  });
  if (error) throw error;
  const rows = data || [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}
