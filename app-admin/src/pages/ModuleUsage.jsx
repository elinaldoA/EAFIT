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

  function pick(value) { setFilter(value); setPage(0); }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const pct = n => (summary && summary.total ? Math.round((n / summary.total) * 100) : 0);
  const tiles = summary && [
    { label: 'Contas (sem admins)', value: summary.total, filter: '', hint: 'base analisada' },
    { label: 'Só musculação', value: summary.onlyStrength, filter: 'musculacao', hint: `${pct(summary.onlyStrength)}% da base` },
    { label: 'Só Run', value: summary.onlyRun, filter: 'corrida', hint: `${pct(summary.onlyRun)}% da base` },
    { label: 'Usam os dois', value: summary.both, filter: 'ambos', hint: `${pct(summary.both)}% da base` },
    { label: 'Ainda não usaram', value: summary.none, filter: 'nenhum', hint: `${pct(summary.none)}% da base` },
    { label: 'Liberados no teste do Run', value: summary.beta, filter: 'beta', hint: 'teste fechado' },
    { label: 'Na lista de espera do Run', value: summary.waitlist, filter: 'waitlist', hint: 'pré-cadastro' },
  ];
  const segments = summary && [
    { key: 'musculacao', label: 'Só musculação', value: summary.onlyStrength },
    { key: 'ambos', label: 'Os dois', value: summary.both },
    { key: 'corrida', label: 'Só Run', value: summary.onlyRun },
    { key: 'nenhum', label: 'Sem uso', value: summary.none },
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
        <>
          <div className="tile-grid tile-grid--kpi mu-tiles">
            {tiles.map(t => (
              <button
                key={t.label} type="button" aria-pressed={filter === t.filter}
                className={`tile tile--kpi mu-tile${filter === t.filter ? ' mu-tile--active' : ''}`}
                onClick={() => pick(t.filter)}
              >
                <span className="tile__label">{t.label}</span>
                <span className="tile__value">{t.value.toLocaleString('pt-BR')}</span>
                <span className="mu-tile__hint">{t.hint}</span>
              </button>
            ))}
          </div>

          {summary.total > 0 && (
            <div className="card">
              <div className="card-head"><h2 className="card-title">Composição da base</h2></div>
              <div className="mu-bar" role="img" aria-label="Composição da base por uso de módulo">
                {segments.filter(sg => sg.value > 0).map(sg => (
                  <span
                    key={sg.key} className={`mu-bar__seg mu-bar__seg--${sg.key}`}
                    style={{ flexGrow: sg.value }} title={`${sg.label}: ${sg.value}`}
                  />
                ))}
              </div>
              <ul className="mu-legend">
                {segments.map(sg => (
                  <li key={sg.key}>
                    <span className={`mu-dot mu-bar__seg--${sg.key}`} />
                    {sg.label} <strong>{sg.value.toLocaleString('pt-BR')}</strong>{' '}
                    <span className="mu-legend__pct">{pct(sg.value)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="card mu-toolbar">
        <input
          className="input" type="search" placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar por nome ou e-mail"
          value={searchInput} onChange={e => setSearchInput(e.target.value)}
        />
        <div className="mu-toolbar__info">
          {filter && (
            <button type="button" className="btn btn--small" onClick={() => pick('')}>
              {FILTERS.find(f => f.value === filter)?.label} ✕
            </button>
          )}
          <span className="user-detail__meta">{data.total.toLocaleString('pt-BR')} pessoa(s)</span>
        </div>
      </div>

      {loading && <Loading />}

      {!loading && !error && (
        !data.rows.length ? (
          <div className="card"><EmptyState icon="🏋️" label="Ninguém com esse filtro." /></div>
        ) : (
          <div className="card mu-card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Pessoa</th>
                    <th scope="col">Escolheu</th>
                    <th scope="col">Uso</th>
                    <th scope="col" className="mu-num">Treinos (30d)</th>
                    <th scope="col" className="mu-num">Corridas (30d)</th>
                    <th scope="col">Run</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(u => (
                    <tr key={u.mu_id}>
                      <td data-label="Pessoa">
                        <Link to={`/users/${u.mu_id}`} className="mu-person">{u.mu_name}</Link>
                        <div className="user-detail__meta">{u.mu_email}</div>
                      </td>
                      <td data-label="Escolheu">{DECLARED_LABELS[u.mu_declared] || u.mu_declared}</td>
                      <td data-label="Uso">
                        <span className={`badge ${USAGE_BADGE[u.mu_usage] || ''}`} style={{ marginLeft: 0 }}>
                          {USAGE_LABELS[u.mu_usage] || u.mu_usage}
                        </span>
                      </td>
                      <td data-label="Treinos (30d)" className="mu-num">
                        <strong>{u.mu_train_30d}</strong>
                        <div className="user-detail__meta">último: {formatDay(u.mu_last_train)}</div>
                      </td>
                      <td data-label="Corridas (30d)" className="mu-num">
                        <strong>{u.mu_runs_30d}</strong>
                        <div className="user-detail__meta">última: {formatDay(u.mu_last_run)}</div>
                      </td>
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
          </div>
        )
      )}

      {!loading && data.total > PAGE_SIZE && (
        <div className="page-header">
          <p className="user-detail__meta">página {page + 1} de {totalPages}</p>
          <div className="actions-row">
            <button className="btn btn--small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
            <button className="btn btn--small" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
