import { useCallback, useEffect, useState } from 'react';
import {
  PAGE_SIZE, GOAL_LABELS, NOTIFIED_OPTIONS,
  fetchWaitlist, fetchWaitlistSummary, setNotified, deleteWaitlistEntry, exportWaitlistCsv,
} from '../lib/runWaitlist';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { useConfirm } from '../context/confirmContext';

export default function RunWaitlist() {
  const ask = useConfirm();
  const [notified, setNotifiedFilter] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([
        fetchWaitlist({ notified, source, page }),
        fetchWaitlistSummary(),
      ]);
      setData(list);
      setSummary(sum);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [notified, source, page]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function run(id, fn) {
    setBusyId(id);
    try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function handleExport() {
    try {
      const csv = await exportWaitlistCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `eafit-run-pre-cadastro-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pré-cadastro do Run</h1>
          <p className="page-subtitle">
            Quem pediu aviso do lançamento do EAFIT Run: pelo site, pelas redes sociais e pelo Perfil do app.
          </p>
        </div>
        <button type="button" className="btn btn--small" onClick={handleExport}>Exportar CSV</button>
      </div>

      {error && <p className="form-msg form-msg--error" role="alert">{error}</p>}

      {summary && (
        <div className="card stack" style={{ gap: 8 }}>
          <div className="actions-row">
            <span><strong>{summary.total}</strong> na lista</span>
            <span><strong>{summary.withAccount}</strong> já têm conta</span>
            <span><strong>{summary.pending}</strong> a avisar</span>
          </div>
          {summary.bySource.length > 0 && (
            <div className="actions-row">
              <button
                type="button" className={`btn btn--small${source === '' ? ' btn--primary' : ''}`}
                onClick={() => { setSource(''); setPage(0); }}
              >Todas as origens</button>
              {summary.bySource.map(([name, n]) => (
                <button
                  key={name} type="button" className={`btn btn--small${source === name ? ' btn--primary' : ''}`}
                  onClick={() => { setSource(name); setPage(0); }}
                >{name} · {n}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="seg" role="group" aria-label="Aviso">
        {NOTIFIED_OPTIONS.map(s => (
          <button
            key={s.value} type="button" aria-pressed={notified === s.value}
            className={`seg__btn${notified === s.value ? ' seg__btn--active' : ''}`}
            onClick={() => { setNotifiedFilter(s.value); setPage(0); }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <Loading />}

      {!loading && !error && (
        <>
          {!data.rows.length ? (
            <div className="card"><EmptyState icon="🏃" label="Ninguém na lista com esse filtro." /></div>
          ) : (
            data.rows.map(item => (
              <div key={item.id} className="card stack" style={{ gap: 8 }}>
                <div>
                  <span className="badge badge--admin" style={{ marginLeft: 0 }}>{item.source}</span>
                  {item.user_id && <span className="badge badge--ok">Tem conta</span>}
                  {item.goal && <span className="badge">{GOAL_LABELS[item.goal] || item.goal}</span>}
                  {item.notified_at && <span className="badge badge--ok">Avisado</span>}
                  <div className="user-detail__meta" style={{ marginTop: 6 }}>
                    {item.name ? `${item.name} · ` : ''}{item.email} · {formatDate(item.created_at)}
                    {item.notified_at && <> · avisado em {formatDate(item.notified_at)}</>}
                  </div>
                </div>
                <div className="actions-row">
                  <button
                    className="btn btn--small" disabled={busyId === item.id}
                    onClick={() => run(item.id, () => setNotified(item.id, !item.notified_at))}
                  >
                    {item.notified_at ? 'Voltar para a avisar' : 'Marcar como avisado'}
                  </button>
                  <button
                    className="btn btn--ghost btn--small" disabled={busyId === item.id}
                    onClick={async () => {
                      if (!await ask('Remover esta pessoa da lista?')) return;
                      run(item.id, () => deleteWaitlistEntry(item.id));
                    }}
                  >Remover</button>
                </div>
              </div>
            ))
          )}

          {data.total > PAGE_SIZE && (
            <div className="page-header">
              <p className="user-detail__meta">{data.total} pessoa(s) · página {page + 1} de {totalPages}</p>
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
