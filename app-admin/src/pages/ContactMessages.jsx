import { useCallback, useEffect, useState } from 'react';
import {
  PAGE_SIZE, TOPIC_LABELS, STATUS_OPTIONS, STATUS_BADGE,
  fetchContactMessages, setContactStatus, deleteContactMessage, replyMailto,
} from '../lib/contactMessages';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const STATUS_FILTERS = [{ value: '', label: 'Todos' }, ...STATUS_OPTIONS];

function MessageCard({ item, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run(fn) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const answered = item.status === 'respondido';
  const handleToggle = () => run(() => setContactStatus(item.id, answered ? 'novo' : 'respondido'));
  const handleDelete = () => {
    if (!window.confirm('Excluir esta mensagem?')) return;
    return run(() => deleteContactMessage(item.id));
  };

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div>
        <span className="badge badge--admin" style={{ marginLeft: 0 }}>{TOPIC_LABELS[item.topic] || item.topic}</span>
        <span className={`badge ${STATUS_BADGE[item.status]}`}>{STATUS_OPTIONS.find(s => s.value === item.status)?.label}</span>
        {item.lang === 'en' && <span className="badge">Inglês</span>}
        <div className="user-detail__meta" style={{ marginTop: 6 }}>
          {item.name} · {item.email} · {formatDate(item.created_at)}
          {item.handled_at && <> · respondido em {formatDate(item.handled_at)}</>}
        </div>
      </div>

      <p className="feedback-message">{item.message}</p>

      <div className="actions-row">
        <a className="btn btn--primary btn--small" href={replyMailto(item)}>Responder por e-mail</a>
        <button className="btn btn--small" disabled={busy} onClick={handleToggle}>
          {answered ? 'Voltar para novo' : 'Marcar como respondido'}
        </button>
        <button className="btn btn--ghost btn--small" disabled={busy} onClick={handleDelete}>Excluir</button>
        {msg && <span className="form-msg form-msg--error">{msg}</span>}
      </div>
    </div>
  );
}

export default function ContactMessages() {
  const [status, setStatus] = useState('novo');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await fetchContactMessages({ status, page }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contato do site</h1>
          <p className="page-subtitle">
            Mensagens enviadas pelo formulário de eafit.com.br. Quem escreve não tem conta: a resposta vai por e-mail.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Status">
          {STATUS_FILTERS.map(s => (
            <button
              key={s.value} type="button" aria-pressed={status === s.value}
              className={`seg__btn${status === s.value ? ' seg__btn--active' : ''}`}
              onClick={() => { setStatus(s.value); setPage(0); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {loading && <Loading />}

      {!loading && !error && (
        <>
          {!data.rows.length ? (
            <div className="card"><EmptyState icon="✉️" label="Nenhuma mensagem com esse filtro." /></div>
          ) : (
            data.rows.map(item => <MessageCard key={`${item.id}-${item.status}`} item={item} onChanged={load} />)
          )}

          {data.total > PAGE_SIZE && (
            <div className="page-header">
              <p className="user-detail__meta">{data.total} mensagem(ns) · página {page + 1} de {totalPages}</p>
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
