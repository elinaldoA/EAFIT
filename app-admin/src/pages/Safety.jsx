import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../lib/supabase';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 50;
const SEVERITY_BADGE = { leve: 'badge--ok', moderada: 'badge--warning', forte: 'badge--danger', lesao: 'badge--danger' };
const SEVERITY_LABEL = { leve: 'Leve', moderada: 'Moderada', forte: 'Forte', lesao: 'Lesão' };

// Visão consolidada de dor/desconforto reportado por TODOS os usuários — o
// UserDetail já mostra isso por usuário, mas dor forte/lesão é sinal de
// segurança e precisa ser visível sem precisar abrir usuário por usuário.
export default function Safety() {
  const [onlySevere, setOnlySevere] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setPage(0); }, [onlySevere]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    db.rpc('admin_list_discomfort', { only_severe: onlySevere, page_size: PAGE_SIZE, page_offset: page * PAGE_SIZE })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setRows(data || []);
        setTotal(data?.[0]?.total_count ?? 0);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onlySevere, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Segurança</h1>
        <label className="actions-row">
          <input type="checkbox" checked={!onlySevere} onChange={e => setOnlySevere(!e.target.checked)} />
          Mostrar leve/moderada também
        </label>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <>
          <table className="resp-table">
            <thead><tr><th>Data</th><th>Usuário</th><th>Exercício</th><th>Severidade</th><th>Nota</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td data-label="Data">{r.log_date}</td>
                  <td data-label="Usuário"><Link className="btn btn--ghost btn--small" to={`/users/${r.user_id}`}>{r.user_email}</Link></td>
                  <td data-label="Exercício">{r.exercise_name}</td>
                  <td data-label="Severidade"><span className={`badge ${SEVERITY_BADGE[r.severity] || ''}`}>{SEVERITY_LABEL[r.severity] || r.severity}</span></td>
                  <td data-label="Nota">{r.note || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5}><EmptyState icon="🩹" label={onlySevere ? 'Nenhum relato de dor forte ou lesão.' : 'Nenhum relato de dor ou desconforto.'} /></td></tr>
              )}
            </tbody>
          </table>

          {total > 0 && (
            <div className="page-header">
              <p className="user-detail__meta">{total} registro(s) · página {page + 1} de {totalPages}</p>
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
