import { useEffect, useMemo, useState } from 'react';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { fetchUsers } from '../lib/users';
import {
  HISTORY_FILTERS, fetchBroadcastHistory, filterHistory, mergeHistory,
} from '../lib/broadcastHistory';

const ORIGIN_LABEL = { manual: 'Manual', scheduled: 'Agendada', auto: 'Automática' };

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function BroadcastHistory() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetchBroadcastHistory(), fetchUsers().catch(() => [])])
      .then(([{ audit, auto }, users]) => {
        if (!active) return;
        const emailById = Object.fromEntries(users.map(u => [u.id, u.email]));
        setItems(mergeHistory(audit, auto, emailById));
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => filterHistory(items, filter), [items, filter]);

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title">Histórico de envios</h1>
      </div>

      <div className="actions-row">
        {HISTORY_FILTERS.map(f => (
          <button
            key={f.key} type="button"
            className={filter === f.key ? 'btn btn--primary btn--small' : 'btn btn--ghost btn--small'}
            onClick={() => setFilter(f.key)}
          >{f.label}</button>
        ))}
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && visible.length === 0 && <EmptyState icon="🔔" label="Nenhum envio por aqui ainda." />}

      {!loading && !error && visible.length > 0 && (
        <table className="resp-table">
          <thead>
            <tr><th>Quando</th><th>Origem</th><th>Título</th><th>Mensagem</th><th>Destino</th><th>Entregues</th></tr>
          </thead>
          <tbody>
            {visible.map(i => (
              <tr key={i.id}>
                <td data-label="Quando">{formatDate(i.at)}</td>
                <td data-label="Origem">{ORIGIN_LABEL[i.origin]}{i.kind ? ` · ${i.kind}` : ''}</td>
                <td data-label="Título">{i.title}</td>
                <td data-label="Mensagem">{i.body}</td>
                <td data-label="Destino">{i.to || (i.recipients != null ? `${i.recipients} dispositivo(s)` : '—')}</td>
                <td data-label="Entregues">{i.origin === 'auto' ? '✓' : `${i.delivered ?? '—'} / ${i.recipients ?? '—'}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="user-detail__meta">Mostra os últimos 100 de cada tipo. "Entregues" conta o que o serviço de push aceitou; o painel não sabe se a pessoa abriu.</p>
    </div>
  );
}
