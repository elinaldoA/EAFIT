import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSegments, deleteSegment, countSegment, describeFilters } from '../lib/segments';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function Segments() {
  const [segments, setSegments] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await fetchSegments();
      setSegments(list);
      // Contagens em paralelo e tolerantes a falha: um segmento que não
      // conta aparece com "—" em vez de derrubar a página.
      const entries = await Promise.all(list.map(async s => {
        try { return [s.id, await countSegment(s)]; } catch { return [s.id, null]; }
      }));
      setCounts(Object.fromEntries(entries));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(segment) {
    if (!window.confirm(`Excluir o segmento "${segment.name}"?`)) return;
    try {
      await deleteSegment(segment.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Segmentos</h1>
          <p className="page-subtitle">
            Grupos de usuários definidos por filtros. Crie na lista de <Link to="/users">Usuários</Link> (aplique os
            filtros e use "Salvar segmento") e use aqui ou em <Link to="/notificacoes">Notificações</Link>.
            O tamanho é recalculado a cada abertura: o segmento acompanha a base.
          </p>
        </div>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}

      <div className="card">
        {!segments.length ? (
          <EmptyState icon="🎯" label="Nenhum segmento salvo ainda." />
        ) : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Segmento</th><th>Critérios</th><th>Usuários hoje</th><th>Criado em</th><th></th></tr></thead>
              <tbody>
                {segments.map(s => (
                  <tr key={s.id}>
                    <td data-label="Segmento"><strong>{s.name}</strong></td>
                    <td data-label="Critérios">{describeFilters(s.filters)}</td>
                    <td data-label="Usuários hoje">{counts[s.id] ?? '—'}</td>
                    <td data-label="Criado em">{formatDate(s.created_at)}</td>
                    <td data-label="">
                      <div className="actions-row">
                        <Link className="btn btn--small" to={`/users?segment=${s.id}`}>Ver usuários</Link>
                        <Link className="btn btn--small" to={`/notificacoes?segment=${s.id}`}>Notificar</Link>
                        <button className="btn btn--ghost btn--small" onClick={() => handleDelete(s)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
