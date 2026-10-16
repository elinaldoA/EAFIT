import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchAmbassadors, fetchReferrals, createAmbassador, updateAmbassador,
  ambassadorLink, suggestCode, isValidCode, conversion, CHANNELS, SOURCE_LABELS,
} from '../lib/ambassadors';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Tudo' },
];

const EMPTY_FORM = { email: '', name: '', code: '' };

// Pessoas → Embaixadores: influenciadores da marca, o link de cada um e as
// contas que chegaram por ele.
export default function Ambassadors() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAmbassadors(days));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  function setName(name) {
    setForm(f => ({ ...f, name, code: codeTouched ? f.code : suggestCode(name) }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await createAmbassador(form);
      setMsg(`Embaixador criado. Link: ${ambassadorLink(form.code.trim().toLowerCase())}`);
      setForm(EMPTY_FORM);
      setCodeTouched(false);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(a, changes) {
    const next = { ...a, ...changes };
    if (changes.code && changes.code !== a.code
      && !window.confirm(`Trocar o código desativa o link antigo (${ambassadorLink(a.code)}). Quem já se cadastrou continua vinculado. Continuar?`)) return;
    setBusy(true);
    setMsg('');
    try {
      await updateAmbassador(next);
      setMsg('Embaixador atualizado.');
      setEditing(null);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`Link copiado: ${text}`);
    } catch {
      window.prompt('Copie o link:', text);
    }
  }

  const totals = rows.reduce((acc, a) => ({
    visits: acc.visits + a.visits, signups: acc.signups + a.signups, total: acc.total + a.total, active7: acc.active7 + a.active7,
  }), { visits: 0, signups: 0, total: 0, active7: 0 });

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Embaixadores</h1>
          <p className="page-subtitle">
            Influenciadores da marca. Cada um tem um código e um link de divulgação: quem abre o link e cria conta
            em até 30 dias fica vinculado ao embaixador (vale o primeiro link aberto naquele navegador).
          </p>
        </div>
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map(p => (
            <button
              key={p.days} type="button" aria-pressed={days === p.days}
              className={`seg__btn${days === p.days ? ' seg__btn--active' : ''}`}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <form className="card form-grid" onSubmit={handleCreate}>
        <label className="field">
          <span className="field__label">E-mail da conta no app</span>
          <input className="input" type="email" required value={form.email} placeholder="pessoa@exemplo.com"
            onChange={e => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Nome de exibição</span>
          <input className="input" value={form.name} placeholder="Ex.: Ana Souza" onChange={e => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Código do link</span>
          <input className="input" required value={form.code} placeholder="anasouza"
            onChange={e => { setCodeTouched(true); setForm({ ...form, code: e.target.value.toLowerCase() }); }} />
        </label>
        <div className="form-grid__actions">
          <span className="card-note" style={{ margin: 0 }}>
            {form.code ? ambassadorLink(form.code) : 'A pessoa precisa ter conta no app.'}
          </span>
          <button className="btn btn--primary" type="submit" disabled={busy || !isValidCode(form.code)}>Criar embaixador</button>
        </div>
      </form>

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && rows.length === 0 && <EmptyState icon="📣" label="Nenhum embaixador ainda." />}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{totals.visits}</div><div className="tile__label">Visitas pelos links no período</div></div>
            <div className="tile"><div className="tile__value">{totals.signups}</div><div className="tile__label">Contas criadas no período</div></div>
            <div className="tile"><div className="tile__value">{totals.total}</div><div className="tile__label">Vinculados no total</div></div>
            <div className="tile"><div className="tile__value">{totals.active7}</div><div className="tile__label">Vinculados ativos (7 dias)</div></div>
          </div>

          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr><th>Embaixador</th><th>Código</th><th>Visitas</th><th>Cadastros</th><th>Conversão</th><th>Total</th><th>Ativos 7d</th><th /></tr>
              </thead>
              <tbody>
                {rows.map(a => (
                  <AmbassadorRow
                    key={a.id} a={a} open={openId === a.id} editing={editing?.id === a.id ? editing : null} busy={busy}
                    onToggle={() => setOpenId(openId === a.id ? '' : a.id)}
                    onEdit={() => setEditing({ id: a.id, name: a.name, code: a.code })}
                    onEditChange={setEditing} onCancel={() => setEditing(null)}
                    onSave={changes => handleSave(a, changes)} onCopy={copy}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-note">
            Visitas = aberturas do link (no máximo 1 por dia por navegador). Ativos 7d = vinculados que abriram o app
            nos últimos 7 dias. O canal vem do link usado (?origem=); prefira os links por canal para saber de onde vem
            cada cadastro.
          </p>
        </>
      )}
    </div>
  );
}

function AmbassadorRow({ a, open, editing, busy, onToggle, onEdit, onEditChange, onCancel, onSave, onCopy }) {
  return (
    <>
      <tr>
        <td data-label="Embaixador">
          {editing ? (
            <input className="input" value={editing.name} aria-label="Nome" onChange={e => onEditChange({ ...editing, name: e.target.value })} />
          ) : (
            <>
              <strong>{a.name}</strong>{' '}
              {!a.active && <span className="badge">inativo</span>}
              <div className="user-detail__meta">
                {a.userId ? <Link to={`/users/${a.userId}`}>{a.email}</Link> : 'conta excluída'}
              </div>
            </>
          )}
        </td>
        <td data-label="Código">
          {editing ? (
            <input className="input" value={editing.code} aria-label="Código"
              onChange={e => onEditChange({ ...editing, code: e.target.value.toLowerCase() })} />
          ) : <code>{a.code}</code>}
        </td>
        <td data-label="Visitas">{a.visits}</td>
        <td data-label="Cadastros">{a.signups}</td>
        <td data-label="Conversão">{conversion(a.visits, a.signups) == null ? '—' : `${conversion(a.visits, a.signups)}%`}</td>
        <td data-label="Total">{a.total}</td>
        <td data-label="Ativos 7d">{a.active7}</td>
        <td>
          <div className="actions-row">
            {editing ? (
              <>
                <button className="btn btn--primary btn--small" disabled={busy || !isValidCode(editing.code) || !editing.name.trim()}
                  onClick={() => onSave({ name: editing.name, code: editing.code })}>Salvar</button>
                <button className="btn btn--ghost btn--small" onClick={onCancel}>Cancelar</button>
              </>
            ) : (
              <>
                <button className="btn btn--ghost btn--small" aria-expanded={open} onClick={onToggle}>
                  {open ? 'Fechar' : `Vinculados (${a.total})`}
                </button>
                <button className="btn btn--ghost btn--small" onClick={onEdit}>Editar</button>
                <button className={`btn btn--small ${a.active ? 'btn--danger' : 'btn--ghost'}`} disabled={busy}
                  onClick={() => onSave({ active: !a.active })}>
                  {a.active ? 'Desativar' : 'Reativar'}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8}>
            <div className="actions-row" style={{ marginBottom: 12 }}>
              <span className="card-note" style={{ margin: 0 }}>Copiar link:</span>
              {CHANNELS.map(c => (
                <button key={c.key} className="btn btn--ghost btn--small" disabled={!a.active}
                  onClick={() => onCopy(ambassadorLink(a.code, c.key))}>{c.label}</button>
              ))}
              {!a.active && <span className="card-note" style={{ margin: 0 }}>Embaixador inativo: o link não vincula novas contas.</span>}
            </div>
            <ReferralList ambassadorId={a.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function ReferralList({ ambassadorId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchReferrals(ambassadorId)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [ambassadorId]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <p className="card-note">Nenhuma conta vinculada ainda.</p>;

  return (
    <table className="resp-table">
      <thead><tr><th>Usuário</th><th>Canal</th><th>Cadastro</th><th>E-mail confirmado</th><th>Último acesso</th><th>Treinos</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.userId}>
            <td data-label="Usuário">
              <Link className="btn btn--ghost btn--small" to={`/users/${r.userId}`}>{r.email}</Link>
              {r.name && <div className="user-detail__meta">{r.name}</div>}
            </td>
            <td data-label="Canal">{SOURCE_LABELS[r.source] || r.source}</td>
            <td data-label="Cadastro">{formatDate(r.linkedAt)}</td>
            <td data-label="E-mail confirmado">
              <span className={`badge ${r.confirmed ? 'badge--ok' : 'badge--warning'}`}>{r.confirmed ? 'sim' : 'não'}</span>
            </td>
            <td data-label="Último acesso">{r.lastSeen ? formatDate(r.lastSeen) : 'nunca'}</td>
            <td data-label="Treinos">{r.workouts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
