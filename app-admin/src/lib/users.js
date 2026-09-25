import { db } from './supabase';

export const PAGE_SIZE = 50;

// Lista SEM paginação — usada pelo picklist de destinatários do Broadcast,
// que precisa da base inteira, não de uma página de cada vez.
export async function fetchUsers() {
  const { data, error } = await db.rpc('admin_list_users');
  if (error) throw error;
  return data || [];
}

export async function fetchUsersPage({ search = '', status = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  const { data, error } = await db.rpc('admin_list_users_page', {
    search: search || null,
    status_filter: status || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  const rows = data || [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}
