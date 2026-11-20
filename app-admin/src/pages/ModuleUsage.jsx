import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PAGE_SIZE, USAGE_LABELS, USAGE_BADGE, DECLARED_LABELS, FILTERS, CSV_COLUMNS,
  fetchUsageSummary, fetchModuleUsers, fetchAllModuleUsers,
} from '../lib/moduleUsage';
import { toCsv, downloadCsv } from '../lib/csv';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

function formatDay(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function ModuleUsage() {
  const [filter, setFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([
        fetchModuleUsers({ filter, search, page }),
        fetchUsageSummary(),
      ]);
      setData(list);
      setSummary(sum);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, search, page]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function handleExport() {
    try {
      const rows = await fetchAllModuleUsers({ filter, search });
      downloadCsv('uso-por-modulo.csv', `﻿${toCsv(rows, CSV_COLUMNS)}`);
    } catch (err) {
      setError(err.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const tiles = summary && [
    { label: 'Contas (sem admins)', value: summary.total, filter: '' },
    { label: 'Só musculação', value: summary.onlyStrength, filter: 'musculacao' },
    { label: 'Só Run', value: summary.onlyRun, filter: 'corrida' },
    { label: 'Usam os dois', value: summary.both, filter: 'ambos' },
    { label: 'Ainda não usaram', value: summary.none, filter: 'nenhum' },
    { label: 'Liberados no teste do Run', value: summary.beta, filter: 'beta' },
    { label: 'Na lista de espera do Run', value: summary.waitlist, filter: 'waitlist' },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Uso por módulo</h1>
          <p className="page-subtitle">
            Quem usa musculação, quem usa só o Run e quem usa os dois. O uso vem do que a pessoa registrou (treinos e corridas), não só do esporte escolhido no perfil.
          </p>
        </div>
        <button type="button" className="btn btn--small" onClick={handleExport}>Exportar CSV</button>
      </div>

      {error && <p className="form-msg form-msg--error" role="alert">{error}</p>}

      {tiles && (
        <div className="actions-row">
          {tiles.map(t => (
            <button
              key={t.label} type="button"
              className={`btn btn--small${filter === t.filter ? ' btn--primary' : ''}`}
              onClick={() => { setFilter(t.filter); setPage(0); }}
            >
              {t.label} · <strong>{t.value}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="page-header">
        <div className="seg" role="group" aria-label="Filtro de uso">
          {FILTERS.map(f => (
            <button
              key={f.value} type="button" aria-pressed={filter === f.value}
              className={`seg__btn${filter === f.value ? ' seg__btn--active' : ''}`}
              onClick={() => { setFilter(f.value); setPage(0); }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input" type="search" placeholder="Buscar por nome ou e-mail"
          value={searchInput} onChange={e => setSearchInput(e.target.value)} style={{ maxWidth: 280 }}
        />
      </div>

      {loading && <Loading />}

      {!loading && !error && (
        !data.rows.length ? (
          <div className="card"><EmptyState icon="🏋️" label="Ninguém com esse filtro." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Pessoa</th>
                  <th scope="col">Escolheu</th>
                  <th scope="col">Uso</th>
                  <th scope="col">Treinos (30d)</th>
                  <th scope="col">Último treino</th>
                  <th scope="col">Corridas (30d)</th>
                  <th scope="col">Última corrida</th>
                  <th scope="col">Run</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(u => (
                  <tr key={u.mu_id}>
                    <td data-label="Pessoa">
                      <Link to={`/users/${u.mu_id}`}>{u.mu_name}</Link>
                      <div className="user-detail__meta">{u.mu_email}</div>
                    </td>
                    <td data-label="Escolheu">{DECLARED_LABELS[u.mu_declared] || u.mu_declared}</td>
                    <td data-label="Uso"><span className={`badge ${USAGE_BADGE[u.mu_usage] || ''}`} style={{ marginLeft: 0 }}>{USAGE_LABELS[u.mu_usage] || u.mu_usage}</span></td>
                    <td data-label="Treinos (30d)">{u.mu_train_30d}</td>
                    <td data-label="Último treino">{formatDay(u.mu_last_train)}</td>
                    <td data-label="Corridas (30d)">{u.mu_runs_30d}</td>
                    <td data-label="Última corrida">{formatDay(u.mu_last_run)}</td>
                    <td data-label="Run">
                      {u.mu_beta && <span className="badge badge--admin" style={{ marginLeft: 0 }}>teste</span>}
                      {u.mu_waitlist && <span className="badge badge--warning">na lista</span>}
                      {!u.mu_beta && !u.mu_waitlist && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && data.total > PAGE_SIZE && (
        <div className="page-header">
          <p className="user-detail__meta">{data.total} pessoa(s) · página {page + 1} de {totalPages}</p>
          <div className="actions-row">
            <button className="btn btn--small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
            <button className="btn btn--small" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
