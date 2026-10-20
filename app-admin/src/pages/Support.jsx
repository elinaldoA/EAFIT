import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { REPLY_MAX } from '../lib/feedback';
import {
  LATE_HOURS, SOURCE_LABELS, STATUS_BADGE, STATUS_LABELS, VIEWS,
  ageHours, assignItem, contactMailto, fetchSupportQueue, filterView, formatAge, kindLabel, reopenItem, replyInApp, resolveItem,
} from '../lib/support';

function ReplyBox({ item, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function send(resolve) {
    setBusy(true);
    setMsg('');
    try {
      const r = await replyInApp(item, text, resolve);
      setMsg(r.notified ? `Resposta enviada${r.emailed ? ' (push e e-mail)' : ' (push)'}.` : 'Resposta salva; o aviso para a pessoa falhou.');
      onDone();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <textarea
        className="input" rows={3} maxLength={REPLY_MAX} aria-label="Resposta"
        placeholder="A pessoa recebe no app (Perfil → Feedback), por push e por e-mail."
        value={text} onChange={e => setText(e.target.value)}
      />
      <div className="actions-row">
        <button type="button" className="btn btn--primary btn--small" disabled={busy || !text.trim()} onClick={() => send(true)}>Responder e resolver</button>
        <button type="button" className="btn btn--ghost btn--small" disabled={busy || !text.trim()} onClick={() => send(false)}>Só responder</button>
      </div>
      {msg && <p className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'form-msg'}>{msg}</p>}
    </div>
  );
}

// Acompanhamento → Central de suporte.
export default function Support() {
  const { adminUser } = useAdminAuth();
  const [view, setView] = useState('abertos');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    fetchSupportQueue(view)
      .then(d => { setData(d); setError(''); })
      .catch(err => setError(err.message));
  }, [view]);
  useEffect(() => { setData(null); load(); }, [load]);

  const items = useMemo(() => (data ? filterView(data.items, view, adminUser?.id) : []), [data, view, adminUser]);
  const adminName = id => data?.admins.find(a => a.id === id)?.label || 'outro admin';

  async function act(fn) {
    try { await fn(); load(); } catch (err) { setError(err.message); }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Central de suporte</h1>
          <p className="page-subtitle">
            Feedback do app e mensagens do site numa fila só, da mais antiga para a mais nova. Pegue para você, responda e
            resolva. Os erros recentes do app da pessoa aparecem junto para ajudar no diagnóstico.
          </p>
        </div>
      </div>

      {data && (
        <div className="tile-grid">
          <div className="tile"><div className="tile__value">{data.stats.open}</div><div className="tile__label">abertos</div></div>
          <div className="tile"><div className="tile__value">{data.stats.unassigned}</div><div className="tile__label">sem responsável</div></div>
          <div className="tile"><div className="tile__value">{data.stats.late}</div><div className="tile__label">abertos há mais de {LATE_HOURS} h</div></div>
          <div className="tile">
            <div className="tile__value">{data.stats.medianHours == null ? '—' : `${String(data.stats.medianHours).replace('.', ',')} h`}</div>
            <div className="tile__label">tempo típico até a resposta (30 dias, {data.stats.answered30} respondidos)</div>
          </div>
        </div>
      )}

      <div className="seg" role="group" aria-label="Fila">
        {VIEWS.map(v => (
          <button key={v.key} type="button" aria-pressed={view === v.key} className={`seg__btn${view === v.key ? ' seg__btn--active' : ''}`} onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!data && !error && <Loading />}
      {data && items.length === 0 && <EmptyState icon="📭" label="Nada nesta fila." />}

      {data && items.length > 0 && (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Há</th><th>De</th><th>Assunto</th><th>Mensagem</th><th>Situação</th><th>Responsável</th><th /></tr></thead>
            <tbody>
              {items.map(i => {
                const age = ageHours(i);
                const key = `${i.source}-${i.id}`;
                return (
                  <tr key={key}>
                    <td data-label="Há">
                      {i.status !== 'resolvido' && age >= LATE_HOURS ? <span className="badge badge--danger">{formatAge(age)}</span> : formatAge(age)}
                    </td>
                    <td data-label="De">
                      {i.account ? <Link to={`/users/${i.account}`}>{i.name}</Link> : i.name}
                      <div className="user-detail__meta">{SOURCE_LABELS[i.source]} · {i.email}</div>
                      {i.errors7 > 0 && <Link className="badge badge--danger" to="/erros">{i.errors7} erro(s) no app em 7 dias</Link>}
                    </td>
                    <td data-label="Assunto">{kindLabel(i)}</td>
                    <td data-label="Mensagem" style={{ maxWidth: 420 }}>
                      {i.message}
                      {i.reply && <div className="user-detail__meta">Resposta: {i.reply}</div>}
                      {open === key && i.source === 'feedback' && i.account && (
                        <div style={{ marginTop: 8 }}><ReplyBox item={i} onDone={() => { setOpen(null); load(); }} /></div>
                      )}
                    </td>
                    <td data-label="Situação"><span className={STATUS_BADGE[i.status]}>{STATUS_LABELS[i.status]}</span></td>
                    <td data-label="Responsável">
                      <select
                        className="input input--sm" aria-label={`Responsável por ${i.name}`} value={i.assignedTo || ''}
                        onChange={e => act(() => assignItem(i, e.target.value, adminUser?.id))}
                      >
                        <option value="">Ninguém</option>
                        {adminUser && <option value={adminUser.id}>Eu</option>}
                        {data.admins.filter(a => a.id !== adminUser?.id).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        {i.assignedTo && i.assignedTo !== adminUser?.id && !data.admins.some(a => a.id === i.assignedTo) && <option value={i.assignedTo}>{adminName(i.assignedTo)}</option>}
                      </select>
                    </td>
                    <td data-label="">
                      <div className="actions-row">
                        {i.status !== 'resolvido' && i.source === 'feedback' && (
                          <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(open === key ? null : key)}>
                            {open === key ? 'Fechar' : 'Responder'}
                          </button>
                        )}
                        {i.status !== 'resolvido' && i.source === 'contato' && (
                          <a className="btn btn--ghost btn--small" href={contactMailto(i)}>Responder por e-mail</a>
                        )}
                        {i.status !== 'resolvido'
                          ? <button type="button" className="btn btn--ghost btn--small" onClick={() => act(() => resolveItem(i))}>Resolver</button>
                          : <button type="button" className="btn btn--ghost btn--small" onClick={() => act(() => reopenItem(i))}>Reabrir</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="user-detail__meta">
        Mensagem do site: a conta do app é encontrada pelo e-mail. As telas <Link to="/feedback">Feedback</Link> e{' '}
        <Link to="/contato">Contato do site</Link> continuam com os filtros e notas de cada origem.
      </p>
    </div>
  );
}
