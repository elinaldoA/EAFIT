import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import { fetchSegments, createSegment, hasFilters } from '../lib/segments';
import { fetchUsersPage, PAGE_SIZE } from '../lib/users';
import { toCsv, downloadCsv } from '../lib/csv';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { METAS, NIVEIS } from '../lib/userDetailHelpers';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'active', label: 'Ativos' },
  { value: 'admin', label: 'Admins' },
  { value: 'banned', label: 'Banidos' },
  { value: 'unconfirmed', label: 'Não confirmados' },
  { value: 'inactive', label: 'Inativos (14+ dias sem treinar)' },
  { value: 'never_trained', label: 'Nunca treinaram' },
];

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Mais recentes' },
  { value: 'created_asc', label: 'Mais antigos' },
  { value: 'login_desc', label: 'Último login' },
  { value: 'training_desc', label: 'Treinou há menos tempo' },
  { value: 'training_asc', label: 'Treinou há mais tempo' },
  { value: 'trainings_desc', label: 'Mais treinos (30 dias)' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

function formatDay(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('created_desc');
  const [nivel, setNivel] = useState('');
  const [meta, setMeta] = useState('');
  const [page, setPage] = useState(0);
  const [segments, setSegments] = useState([]);
  const [segmentMsg, setSegmentMsg] = useState('');
  const { adminUser } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Debounce simples: só dispara a busca 300ms depois do usuário parar de
  // digitar, pra não fazer uma query por tecla.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [status, sort, nivel, meta]);

  useEffect(() => { fetchSegments().then(setSegments).catch(() => {}); }, []);

  function applyFilters(f = {}) {
    setSearchInput(f.search || '');
    setSearch(f.search || '');
    setStatus(f.status || '');
    setNivel(f.nivel || '');
    setMeta(f.meta || '');
    setPage(0);
  }

  // Link vindo da página Segmentos (?segment=ID): aplica os filtros salvos.
  const segmentParam = searchParams.get('segment');
  useEffect(() => {
    if (!segmentParam || !segments.length) return;
    const seg = segments.find(x => x.id === segmentParam);
    if (seg) applyFilters(seg.filters);
    setSearchParams({}, { replace: true });
  }, [segmentParam, segments, setSearchParams]);

  async function handleSaveSegment() {
    const filters = { search, status, nivel, meta };
    const name = window.prompt('Nome do segmento (ex.: Iniciantes inativos):');
    if (!name?.trim()) return;
    setSegmentMsg('');
    try {
      await createSegment({ name, filters, adminId: adminUser?.id });
      setSegments(await fetchSegments());
      setSegmentMsg(`Segmento "${name.trim()}" salvo.`);
    } catch (err) {
      setSegmentMsg(`Erro: ${err.message}`);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchUsersPage({ search, status, sort, nivel, meta, page })
      .then(({ rows, total }) => { if (active) { setUsers(rows); setTotal(total); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, status, sort, nivel, meta, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleExport() {
    // Exporta a base filtrada inteira (não só a página atual), com o mesmo
    // filtro em vigor — pra isso vale a pena um limite bem alto em vez de
    // paginar N vezes.
    const { rows } = await fetchUsersPage({ search, status, sort, nivel, meta, page: 0, pageSize: 10000 });
    downloadCsv('usuarios.csv', toCsv(rows, [
      { key: 'nome', label: 'Nome' }, { key: 'sobrenome', label: 'Sobrenome' },
      { key: 'apelido', label: 'Apelido' }, { key: 'email', label: 'Email' },
      { key: 'peso_alvo', label: 'PesoAlvo' }, { key: 'nivel', label: 'Nivel' }, { key: 'meta', label: 'Meta' },
      { key: 'last_training', label: 'UltimoTreino' }, { key: 'trainings_30d', label: 'Treinos30d' },
      { key: 'plan_end_date', label: 'FimDoPlano' }, { key: 'created_at', label: 'CriadoEm' },
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
            placeholder="Buscar por nome, apelido ou e-mail…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="input" value={nivel} onChange={e => setNivel(e.target.value)} aria-label="Nível">
            <option value="">Todos os níveis</option>
            {NIVEIS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="input" value={meta} onChange={e => setMeta(e.target.value)} aria-label="Objetivo">
            <option value="">Todos os objetivos</option>
            {METAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="input" value={sort} onChange={e => setSort(e.target.value)} aria-label="Ordenar por">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {segments.length > 0 && (
            <select className="input" value="" aria-label="Aplicar segmento" onChange={e => {
              const seg = segments.find(x => x.id === e.target.value);
              if (seg) applyFilters(seg.filters);
            }}>
              <option value="">Aplicar segmento…</option>
              {segments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <button
            className="btn btn--small" onClick={handleSaveSegment}
            disabled={!hasFilters({ search, status, nivel, meta })}
            title="Guarda os filtros atuais como um segmento reutilizável"
          >
            Salvar segmento
          </button>
          <button className="btn btn--small" onClick={handleExport} disabled={total === 0}>Exportar CSV</button>
        </div>
      </div>

      {segmentMsg && <p className={`form-msg ${segmentMsg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{segmentMsg}</p>}
      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="table-wrap"><table className="resp-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Sobrenome</th>
                <th>Apelido</th>
                <th>E-mail</th>
                <th>Peso alvo</th>
                <th>Nível / objetivo</th>
                <th>Último treino</th>
                <th>Treinos (30d)</th>
                <th>Fim do plano</th>
                <th>Criado em</th>
                <th>Último login</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td data-label="Nome">{u.nome || '—'}</td>
                  <td data-label="Sobrenome">{u.sobrenome || '—'}</td>
                  <td data-label="Apelido">{u.apelido || '—'}</td>
                  <td data-label="E-mail">{u.email}</td>
                  <td data-label="Peso alvo">{u.peso_alvo ? `${u.peso_alvo} kg` : '—'}</td>
                  <td data-label="Nível / objetivo">{[u.nivel, u.meta].filter(Boolean).join(' · ') || '—'}</td>
                  <td data-label="Último treino">{formatDay(u.last_training)}</td>
                  <td data-label="Treinos (30d)">{u.trainings_30d}</td>
                  <td data-label="Fim do plano">{formatDay(u.plan_end_date)}</td>
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
                <tr><td colSpan={13}><EmptyState icon="👥" label="Nenhum usuário encontrado." /></td></tr>
              )}
            </tbody>
          </table></div>

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
