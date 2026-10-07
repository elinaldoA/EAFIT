import { useCallback, useEffect, useState } from 'react';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { fetchClientErrors, purgeOldClientErrors, KIND_LABELS, PAGE_SIZE } from '../lib/clientErrors';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function ClientErrors() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async (targetPage) => {
    setLoading(true);
    setError('');
    try {
      const { rows: r, total: t } = await fetchClientErrors({ page: targetPage });
      setRows(r);
      setTotal(t);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  async function handlePurge() {
    if (!window.confirm('Apagar os erros com mais de 30 dias?')) return;
    try {
      const removed = await purgeOldClientErrors(30);
      setMsg(`${removed} erro(s) apagado(s).`);
      setPage(0);
      await load(0);
    } catch (err) {
      setError(err.message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Erros do app</h1>
        <button type="button" className="btn btn--small" onClick={handlePurge}>Limpar com mais de 30 dias</button>
      </div>
      <p className="user-detail__meta">
        Erros capturados no navegador de quem usa o app (no máximo 10 por sessão, sem repetir o mesmo).
      </p>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {msg && <p className="form-msg">{msg}</p>}

      {!loading && !error && (
        <>
          <table className="resp-table">
            <thead>
              <tr><th>Quando</th><th>Tipo</th><th>Mensagem</th><th>Tela</th><th>Usuário</th><th>Stack</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td data-label="Quando">{formatDate(r.created_at)}</td>
                  <td data-label="Tipo">{KIND_LABELS[r.kind] || r.kind}</td>
                  <td data-label="Mensagem">{r.message}</td>
                  <td data-label="Tela">{r.url || '—'}</td>
                  <td data-label="Usuário" title={r.user_id}>{r.user_id.slice(0, 8)}</td>
                  <td data-label="Stack">
                    {r.stack ? (
                      <details>
                        <summary style={{ cursor: 'pointer' }}>ver</summary>
                        <pre className="template-json-preview">{r.stack}</pre>
                      </details>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}><EmptyState icon="✅" label="Nenhum erro registrado." /></td></tr>}
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
