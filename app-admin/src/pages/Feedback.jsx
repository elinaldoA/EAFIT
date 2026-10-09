import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PAGE_SIZE, KIND_LABELS, KIND_BADGE, STATUS_OPTIONS, STATUS_BADGE,
  fetchFeedback, updateFeedback, deleteFeedback, noteChanged, noteValue,
  REPLY_MAX, replyValue, replyToFeedback,
} from '../lib/feedback';
import { displayName } from '../lib/management';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const STATUS_FILTERS = [{ value: '', label: 'Todos' }, ...STATUS_OPTIONS];

function FeedbackCard({ item, onChanged }) {
  const [note, setNote] = useState(item.admin_note || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [reply, setReply] = useState('');
  const [resolveOnReply, setResolveOnReply] = useState(true);

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

  const handleStatus = e => run(() => updateFeedback(item.id, { status: e.target.value }));
  const handleSaveNote = () => run(() => updateFeedback(item.id, { admin_note: noteValue(note) }));
  async function handleReply() {
    setBusy(true);
    setMsg('');
    try {
      const { notified, emailed } = await replyToFeedback(item, reply, { resolve: resolveOnReply });
      if (!notified) setMsg('Resposta salva, mas o aviso ao usuário falhou (ele ainda a vê no Perfil).');
      else if (!emailed) setMsg('Resposta enviada pelo app, mas o e-mail não saiu (ele ainda a vê no Perfil).');
      else setMsg('Resposta enviada: aviso no app e e-mail.');
      setReply('');
      await onChanged();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }
  const handleDelete = () => {
    if (!window.confirm('Excluir este feedback?')) return;
    return run(() => deleteFeedback(item.id));
  };

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <span className={`badge ${KIND_BADGE[item.kind]}`} style={{ marginLeft: 0 }}>{KIND_LABELS[item.kind]}</span>
          <span className={`badge ${STATUS_BADGE[item.status]}`}>{STATUS_OPTIONS.find(s => s.value === item.status)?.label}</span>
          <div className="user-detail__meta" style={{ marginTop: 6 }}>
            <Link to={`/users/${item.user_id}`}>{displayName(item)}</Link> · {item.email} · {formatDate(item.created_at)}
            {item.resolved_at && <> · resolvido em {formatDate(item.resolved_at)}</>}
          </div>
        </div>
        <select className="input" value={item.status} disabled={busy} onChange={handleStatus} aria-label="Status">
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <p className="feedback-message">{item.message}</p>

      {item.admin_reply && (
        <div className="card" style={{ background: 'var(--surface-2, transparent)' }}>
          <span className="field__label">Sua resposta · {formatDate(item.replied_at)}</span>
          <p className="feedback-message">{item.admin_reply}</p>
        </div>
      )}

      <label className="field">
        <span className="field__label">{item.admin_reply ? 'Nova resposta ao usuário' : 'Responder ao usuário (ele recebe um aviso no app e um e-mail)'}</span>
        <textarea className="input" rows={2} maxLength={REPLY_MAX} value={reply} onChange={e => setReply(e.target.value)} />
      </label>
      <div className="actions-row">
        <button className="btn btn--primary btn--small" disabled={busy || !replyValue(reply)} onClick={handleReply}>Enviar resposta</button>
        {item.status !== 'resolvido' && (
          <label><input type="checkbox" checked={resolveOnReply} onChange={e => setResolveOnReply(e.target.checked)} /> Marcar como resolvido</label>
        )}
      </div>

      <label className="field">
        <span className="field__label">Nota interna (o usuário não vê)</span>
        <textarea className="input" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      </label>

      <div className="actions-row">
        <button className="btn btn--small" disabled={busy || !noteChanged(item.admin_note, note)} onClick={handleSaveNote}>Salvar nota</button>
        <button className="btn btn--ghost btn--small" disabled={busy} onClick={handleDelete}>Excluir</button>
        {msg && <span className={`form-msg ${msg.startsWith('Resposta enviada:') ? 'form-msg--ok' : 'form-msg--error'}`}>{msg}</span>}
      </div>
    </div>
  );
}

export default function Feedback() {
  const [status, setStatus] = useState('novo');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0, novos: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await fetchFeedback({ status, kind, page }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, kind, page]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Feedback dos usuários</h1>
          <p className="page-subtitle">
            Sugestões, problemas e elogios enviados pelo Perfil do app. {data.novos > 0 ? `${data.novos} novo(s) aguardando.` : 'Nenhum novo no momento.'}
          </p>
        </div>
        <div className="actions-row">
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
          <select className="input" value={kind} onChange={e => { setKind(e.target.value); setPage(0); }} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {loading && <Loading />}

      {!loading && !error && (
        <>
          {!data.rows.length ? (
            <div className="card"><EmptyState icon="💬" label="Nenhum feedback com esses filtros." /></div>
          ) : (
            data.rows.map(item => <FeedbackCard key={`${item.id}-${item.status}-${item.admin_note}`} item={item} onChanged={load} />)
          )}

          {data.total > PAGE_SIZE && (
            <div className="page-header">
              <p className="user-detail__meta">{data.total} feedback(s) · página {page + 1} de {totalPages}</p>
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
