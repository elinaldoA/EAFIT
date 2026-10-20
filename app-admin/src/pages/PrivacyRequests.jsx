import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { todayStr } from '../lib/community';
import {
  CHANNEL_LABELS, DUE_DAYS, KIND_LABELS, STATUS_BADGE, STATUS_LABELS,
  createRequest, daysLeft, fetchRequests, updateRequest,
} from '../lib/privacy';

const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function NewRequest({ onSaved, onCancel }) {
  const { adminUser } = useAdminAuth();
  const [draft, setDraft] = useState({ email: '', kind: 'acesso', channel: 'email', receivedOn: todayStr(), notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createRequest(draft, adminUser?.id);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="section-title" style={{ margin: 0 }}>Registrar pedido</h2>
      <div className="two-col">
        <label className="field">
          <span className="field__label">E-mail de quem pediu</span>
          <input className="input" type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Pedido</span>
          <select className="input" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>
            {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Chegou por</span>
          <select className="input" value={draft.channel} onChange={e => setDraft({ ...draft, channel: e.target.value })}>
            {Object.entries(CHANNEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Recebido em (prazo: {DUE_DAYS} dias)</span>
          <input className="input" type="date" value={draft.receivedOn} onChange={e => setDraft({ ...draft, receivedOn: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Notas (opcional)</span>
        <textarea className="input" rows={2} maxLength={2000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
      </label>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      <div className="actions-row">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Salvando…' : 'Registrar'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="card-note" style={{ margin: 0 }}>A conta do app é ligada ao pedido pelo e-mail, quando existir.</p>
    </form>
  );
}

function RequestRow({ req, onChanged }) {
  const [notes, setNotes] = useState(req.notes);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const left = daysLeft(req);

  async function run(fn, ok) {
    setBusy(true);
    setMsg('');
    try { await fn(); setMsg(ok); onChanged(); } catch (err) { setMsg(`Erro: ${err.message}`); } finally { setBusy(false); }
  }

  return (
    <tr>
      <td data-label="Recebido">{fmtDate(req.received_at)}<div className="user-detail__meta">{CHANNEL_LABELS[req.channel]}</div></td>
      <td data-label="Quem">
        {req.user_id ? <Link to={`/users/${req.user_id}`}>{req.email}</Link> : req.email}
        {!req.user_id && <div className="user-detail__meta">sem conta no app</div>}
      </td>
      <td data-label="Pedido">{KIND_LABELS[req.kind]}</td>
      <td data-label="Prazo">
        {left == null ? `resolvido ${fmtDate(req.resolved_at)}`
          : left < 0 ? <span className="badge badge--danger">vencido há {-left} dia(s)</span>
            : <span className={left <= 3 ? 'badge badge--warning' : 'badge'}>{left} dia(s) · {fmtDate(req.due_at)}</span>}
      </td>
      <td data-label="Situação">
        <select className="input input--sm" aria-label={`Situação do pedido de ${req.email}`} value={req.status} disabled={busy}
          onChange={e => run(() => updateRequest(req.id, { status: e.target.value }), 'Situação salva.')}>
          {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className={STATUS_BADGE[req.status]} style={{ marginLeft: 6 }}>{STATUS_LABELS[req.status]}</span>
      </td>
      <td data-label="Notas">
        <textarea className="input input--sm" rows={2} maxLength={2000} value={notes} aria-label={`Notas do pedido de ${req.email}`} onChange={e => setNotes(e.target.value)} />
        {notes !== req.notes && <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => run(() => updateRequest(req.id, { notes }), 'Notas salvas.')}>Salvar notas</button>}
      </td>
      <td data-label="">
        {req.user_id && ['acesso', 'portabilidade'].includes(req.kind) && (
          <Link className="btn btn--small" to={`/users/${req.user_id}`}>Baixar dados na ficha</Link>
        )}
        {req.user_id && req.kind === 'exclusao' && <Link className="btn btn--ghost btn--small" to={`/users/${req.user_id}`}>Excluir na ficha</Link>}
        {msg && <div className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'user-detail__meta'}>{msg}</div>}
      </td>
    </tr>
  );
}

// Sistema → Pedidos LGPD.
export default function PrivacyRequests() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetchRequests().then(r => { setItems(r); setError(''); }).catch(err => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (items || []).filter(r => daysLeft(r) != null);
  const late = open.filter(r => daysLeft(r) < 0).length;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos LGPD</h1>
          <p className="page-subtitle">
            Pedidos de titulares (acesso, portabilidade, correção, exclusão…) com o prazo de {DUE_DAYS} dias da LGPD. O
            arquivo de acesso ou portabilidade e a exclusão ficam na ficha do usuário (aba Ações), com registro na auditoria.
          </p>
        </div>
        {!creating && <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>Registrar pedido</button>}
      </div>

      {items && (
        <div className="tile-grid">
          <div className="tile"><div className="tile__value">{open.length}</div><div className="tile__label">em aberto</div></div>
          <div className="tile"><div className="tile__value">{late}</div><div className="tile__label">vencidos</div></div>
        </div>
      )}
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {creating && <NewRequest onSaved={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}
      {!items && !error && <Loading />}
      {items && items.length === 0 && !creating && <EmptyState icon="🔐" label="Nenhum pedido registrado." />}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Recebido</th><th>Quem</th><th>Pedido</th><th>Prazo</th><th>Situação</th><th>Notas</th><th /></tr></thead>
            <tbody>{items.map(r => <RequestRow key={`${r.id}-${r.status}-${r.notes}`} req={r} onChanged={load} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
