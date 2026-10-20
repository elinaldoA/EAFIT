import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { formatDate } from '../lib/userDetailHelpers';
import {
  CONFEF_URL, REJECT_REASONS, STATUS_BADGE, STATUS_LABELS,
  decideRequest, fetchRequests, fetchTrainerCrefs, setTrainerCref, splitCref,
} from '../lib/trainerVerification';

function RequestRow({ r, onDone }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parts = splitCref(r.cref);

  async function decide(approve) {
    if (approve && !window.confirm(`Liberar o modo Personal para ${r.name} (CREF ${r.cref})?`)) return;
    setBusy(true); setError('');
    try { await decideRequest(r.id, approve, approve ? '' : reason); onDone(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <tr>
      <td data-label="Pessoa">
        <Link to={`/users/${r.userId}`}>{r.name}</Link>
        <div className="user-detail__meta">{r.email} · conta desde {formatDate(r.accountCreated)}{r.previous ? ` · ${r.previous} pedido(s) antes` : ''}</div>
        {r.note && <div className="user-detail__meta">“{r.note}”</div>}
      </td>
      <td data-label="CREF">
        <code>{r.cref}</code>
        {parts && <div className="user-detail__meta">{parts.category === 'G' ? 'graduado' : 'provisionado'} · {parts.uf}</div>}
      </td>
      <td data-label="Pedido">{formatDate(r.createdAt)}</td>
      <td data-label="Situação">
        {r.status === 'pendente' ? (
          <div className="stack" style={{ gap: 6 }}>
            <div className="actions-row">
              <a className="btn btn--ghost btn--small" href={CONFEF_URL} target="_blank" rel="noreferrer">Conferir no CONFEF ↗</a>
              <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => decide(true)}>Aprovar</button>
              <button type="button" className="btn btn--danger btn--small" disabled={busy} onClick={() => setRejecting(!rejecting)}>Recusar</button>
            </div>
            {rejecting && (
              <div className="actions-row">
                <select className="input input--sm" aria-label="Motivo pronto" value={REJECT_REASONS.includes(reason) ? reason : ''}
                  onChange={e => e.target.value && setReason(e.target.value)}>
                  <option value="">Outro motivo…</option>
                  {REJECT_REASONS.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
                <input className="input input--sm" aria-label="Motivo da recusa" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
                <button type="button" className="btn btn--small" disabled={busy} onClick={() => decide(false)}>Enviar recusa</button>
              </div>
            )}
            {error && <span className="form-msg form-msg--error">{error}</span>}
          </div>
        ) : (
          <>
            <span className={STATUS_BADGE[r.status]}>{r.status}</span>
            <div className="user-detail__meta">{formatDate(r.decidedAt)}{r.decidedBy ? ` · ${r.decidedBy}` : ''}</div>
            {r.reason && <div className="user-detail__meta">{r.reason}</div>}
          </>
        )}
      </td>
    </tr>
  );
}

function CrefCell({ t, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(t.cref || '');
  const [error, setError] = useState('');
  async function save() {
    setError('');
    try { await setTrainerCref(t.userId, value); setEditing(false); onSaved(); } catch (err) { setError(err.message); }
  }
  if (!editing) {
    return (
      <button type="button" className="btn btn--ghost btn--small" aria-label={`CREF de ${t.email}`} onClick={() => setEditing(true)}>
        {t.cref || 'Registrar CREF'}
      </button>
    );
  }
  return (
    <div className="actions-row">
      <input className="input input--sm" style={{ maxWidth: 140 }} placeholder="012345-G/SP" value={value} onChange={e => setValue(e.target.value)} aria-label="CREF" />
      <button type="button" className="btn btn--small btn--primary" onClick={save}>Salvar</button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(false)}>Cancelar</button>
      {error && <span className="form-msg form-msg--error">{error}</span>}
    </div>
  );
}

// Pessoas → Verificação de CREF.
export default function TrainerVerification() {
  const [status, setStatus] = useState('pendente');
  const [rows, setRows] = useState(null);
  const [trainers, setTrainers] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([fetchRequests(status), fetchTrainerCrefs()])
      .then(([r, tr]) => { setRows(r); setTrainers(tr); setError(''); })
      .catch(err => setError(err.message));
  }, [status]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const unverified = (trainers || []).filter(t => !t.verifiedAt);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Verificação de CREF</h1>
          <p className="page-subtitle">
            Pedidos de acesso ao modo Personal feitos pelo app (Perfil → Sou personal trainer). Confira o nome e o número
            na consulta pública do CONFEF antes de aprovar. Aprovar libera o modo Personal; recusar manda o motivo para a
            pessoa, que pode pedir de novo. Tudo fica na auditoria.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Situação">
          {Object.entries(STATUS_LABELS).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={status === k} className={`seg__btn${status === k ? ' seg__btn--active' : ''}`} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!rows && !error && <Loading />}
      {rows && (rows.length === 0 ? <EmptyState icon="🪪" label={status === 'pendente' ? 'Nenhum pedido esperando análise.' : 'Nenhum pedido aqui.'} /> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Pessoa</th><th>CREF</th><th>Pedido</th><th>Situação</th></tr></thead>
            <tbody>{rows.map(r => <RequestRow key={r.id} r={r} onDone={load} />)}</tbody>
          </table>
        </div>
      ))}

      {trainers && (
        <div className="card">
          <h2 className="section-title">Personais liberados ({trainers.length}) · {unverified.length} sem CREF verificado</h2>
          {trainers.length === 0 ? <p className="user-detail__meta">Nenhum personal ainda.</p> : (
            <div className="table-wrap">
              <table className="resp-table">
                <thead><tr><th>Personal</th><th>Código</th><th>CREF</th><th>Verificado em</th></tr></thead>
                <tbody>
                  {trainers.map(t => (
                    <tr key={t.userId}>
                      <td data-label="Personal"><Link to={`/users/${t.userId}`}>{t.email}</Link><div className="user-detail__meta">desde {formatDate(t.since)}</div></td>
                      <td data-label="Código"><code>{t.code}</code></td>
                      <td data-label="CREF"><CrefCell key={`${t.userId}-${t.cref}`} t={t} onSaved={load} /></td>
                      <td data-label="Verificado em">{t.verifiedAt ? formatDate(t.verifiedAt) : <span className="badge badge--warning">não verificado</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="card-note">Para quem foi liberado antes da verificação: confira no CONFEF e registre o CREF (salvar marca como verificado agora; vazio apaga).</p>
        </div>
      )}
    </div>
  );
}
