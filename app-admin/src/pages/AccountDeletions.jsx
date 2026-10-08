import { useEffect, useState } from 'react';
import {
  DELETION_SOURCE, DELETIONS_PAGE_SIZE, fetchAccountDeletions, summarizeDeletions, formatAge,
} from '../lib/ops';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

// Registro das contas excluídas. De propósito não diz quem era: a conta e os
// dados foram apagados, fica só a prova de que o pedido foi atendido.
export default function AccountDeletions() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAccountDeletions({ page })
      .then(d => { if (active) setData(d); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(data.total / DELETIONS_PAGE_SIZE));
  const summary = summarizeDeletions(data.rows);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Exclusões de conta</h1>
          <p className="page-subtitle">
            Cada conta excluída, pela própria pessoa (Perfil → Excluir conta) ou por um admin. O registro não guarda
            nome, e-mail nem id: serve para comprovar que o pedido foi atendido e para entender quando as pessoas saem.
          </p>
        </div>
        {!loading && !error && <span className="badge badge--admin">{data.total} no total</span>}
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <>
          {data.rows.length > 0 && (
            <div className="tile-grid">
              <div className="tile"><div className="tile__value">{summary.self}</div><div className="tile__label">pedidas pela própria pessoa (nesta página)</div></div>
              <div className="tile"><div className="tile__value">{summary.neverTrained}</div><div className="tile__label">saíram sem nunca treinar</div></div>
              <div className="tile"><div className="tile__value">{formatAge(summary.medianAgeDays)}</div><div className="tile__label">tempo mediano de conta</div></div>
            </div>
          )}

          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Quando</th><th>Quem pediu</th><th>Tempo de conta</th><th>Treinos registrados</th></tr></thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.id}>
                    <td data-label="Quando">{formatDate(r.deleted_at)}</td>
                    <td data-label="Quem pediu">{DELETION_SOURCE[r.source] || r.source}</td>
                    <td data-label="Tempo de conta">{formatAge(r.account_age_days)}</td>
                    <td data-label="Treinos registrados">{r.workouts ?? '—'}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={4}><EmptyState icon="🗑️" label="Nenhuma conta excluída desde que o registro começou." /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data.total > 0 && (
            <div className="page-header">
              <p className="user-detail__meta">{data.total} registro(s) · página {page + 1} de {totalPages}</p>
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
