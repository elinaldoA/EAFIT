import { db } from './supabase';

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
    const { data, error } = await db.from('account_deactivations').select('user_id');
    if (error) return new Set();
    return new Set((data || []).map(r => r.user_id));
  } catch {
    return new Set();
  }
}

export async function fetchUsersPage({ search = '', status = '', sort = '', nivel = '', meta = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  const { data, error } = await db.rpc('admin_list_users_page', {
    search: search || null,
    status_filter: status || null,
    page_size: pageSize,
    page_offset: page * pageSize,
    sort_by: sort || 'created_desc',
    nivel_filter: nivel || null,
    meta_filter: meta || null,
  });
  if (error) throw error;
  const rows = data || [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}
