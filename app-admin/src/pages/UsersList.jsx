import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';
import { toCsv, downloadCsv } from '../lib/csv';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 50;
const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'active', label: 'Ativos' },
  { value: 'admin', label: 'Admins' },
  { value: 'banned', label: 'Banidos' },
  { value: 'unconfirmed', label: 'Não confirmados' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

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

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  // Debounce simples: só dispara a busca 300ms depois do usuário parar de
  // digitar, pra não fazer uma query por tecla.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [status]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchUsersPage({ search, status, page })
      .then(({ rows, total }) => { if (active) { setUsers(rows); setTotal(total); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, status, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleExport() {
    // Exporta a base filtrada inteira (não só a página atual), com o mesmo
    // filtro em vigor — pra isso vale a pena um limite bem alto em vez de
    // paginar N vezes.
    const { rows } = await fetchUsersPage({ search, status, page: 0, pageSize: 10000 });
    downloadCsv('usuarios.csv', toCsv(rows, [
      { key: 'email', label: 'Email' }, { key: 'created_at', label: 'CriadoEm' },
      { key: 'last_sign_in_at', label: 'UltimoLogin' }, { key: 'email_confirmed_at', label: 'Confirmado' },
      { key: 'banned_until', label: 'BanidoAte' }, { key: 'is_admin', label: 'Admin' },
    ]));
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Usuários</h1>
        <div className="actions-row">
          <input
            className="input search-input"
            placeholder="Buscar por e-mail…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn btn--small" onClick={handleExport} disabled={total === 0}>Exportar CSV</button>
        </div>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <>
          <table className="resp-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Criado em</th>
                <th>Último login</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td data-label="E-mail">{u.email}</td>
                  <td data-label="Criado em">{formatDate(u.created_at)}</td>
                  <td data-label="Último login">{formatDate(u.last_sign_in_at)}</td>
                  <td data-label="Status">
                    {u.is_admin && <span className="badge badge--admin">admin</span>}
                    {u.banned_until && new Date(u.banned_until) > new Date() && <span className="badge badge--danger">banido</span>}
                    {!u.email_confirmed_at && <span className="badge badge--warning">não confirmado</span>}
                    {!u.is_admin && !u.banned_until && u.email_confirmed_at && <span className="badge badge--ok">ativo</span>}
                  </td>
                  <td data-label="">
                    <Link className="btn btn--ghost btn--small" to={`/users/${u.id}`}>Ver</Link>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5}><EmptyState icon="👥" label="Nenhum usuário encontrado." /></td></tr>
              )}
            </tbody>
          </table>

          {total > 0 && (
            <div className="page-header">
              <p className="user-detail__meta">
                {total} usuário(s) · página {page + 1} de {totalPages}
              </p>
              <div className="actions-row">
                <button className="btn btn--small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
                <button className="btn btn--small" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
