import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchAmbassadors, fetchReferrals, createAmbassador, updateAmbassador,
  ambassadorLink, suggestCode, isValidCode, conversion, kindLabel, CHANNELS, KINDS, SOURCE_LABELS,
  sendProgramMessage, MESSAGE_AUDIENCES, MESSAGE_TITLE_MAX, MESSAGE_BODY_MAX,
} from '../lib/ambassadors';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import PromoMaterialsAdmin from '../components/PromoMaterialsAdmin';
import PersonStat from '../components/PersonStat';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Tudo' },
];

const EMPTY_FORM = { email: '', name: '', code: '', kind: 'embaixador' };

const FILTERS = [{ key: '', label: 'Todos' }, ...KINDS.map(k => ({ key: k.key, label: k.plural }))];

// Pessoas → Embaixadores e influenciadores: o link de cada um e as contas que
// chegaram por ele. Os dois tipos têm o mesmo programa; só muda o nome.
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
  const [filter, setFilter] = useState('');

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
      setMsg(`${kindLabel(form.kind)} criado. Link: ${ambassadorLink(form.code.trim().toLowerCase())}`);
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
      setMsg(`${kindLabel(next.kind)} atualizado.`);
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

  // Aviso some sozinho: aparece flutuando, perto de onde o admin clicou.
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), msg.startsWith('Erro') ? 8000 : 6000);
    return () => clearTimeout(t);
  }, [msg]);

  const shown = filter ? rows.filter(a => a.kind === filter) : rows;
  const totals = shown.reduce((acc, a) => ({
    visits: acc.visits + a.visits, signups: acc.signups + a.signups, total: acc.total + a.total, active7: acc.active7 + a.active7,
  }), { visits: 0, signups: 0, total: 0, active7: 0 });
  const ready = !loading && !error;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Embaixadores e influenciadores</h1>
          <p className="page-subtitle">
            Os dois tipos têm o mesmo programa, só muda o nome. Quem abre o link de divulgação e cria conta em até 30 dias
            fica vinculado a quem divulgou.
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

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {ready && rows.length > 0 && (
        <div className="seg" role="group" aria-label="Tipo" style={{ alignSelf: 'flex-start' }}>
          {FILTERS.map(f => (
            <button
              key={f.key || 'todos'} type="button" aria-pressed={filter === f.key}
              className={`seg__btn${filter === f.key ? ' seg__btn--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {ready && shown.length === 0 && (
        <div className="card">
          <EmptyState icon="📣" label={filter === 'influenciador' ? 'Nenhum influenciador ainda.' : 'Nenhum embaixador ainda.'} />
        </div>
      )}

      {ready && shown.length > 0 && (
        <>
          <div className="tile-grid tile-grid--4">
            <div className="tile"><div className="tile__value">{totals.visits}</div><div className="tile__label">Visitas pelos links no período</div></div>
            <div className="tile"><div className="tile__value">{totals.signups}</div><div className="tile__label">Contas criadas no período</div></div>
            <div className="tile"><div className="tile__value">{totals.total}</div><div className="tile__label">Vinculados no total</div></div>
            <div className="tile"><div className="tile__value">{totals.active7}</div><div className="tile__label">Vinculados ativos (7 dias)</div></div>
          </div>

          <ul className="pcard-list">
            {shown.map(a => (
              <AmbassadorCard
                key={a.id} a={a} open={openId === a.id} editing={editing?.id === a.id ? editing : null} busy={busy}
                onToggle={() => setOpenId(openId === a.id ? '' : a.id)}
                onEdit={() => setEditing({ id: a.id, name: a.name, code: a.code, kind: a.kind })}
                onEditChange={setEditing} onCancel={() => setEditing(null)}
                onSave={changes => handleSave(a, changes)} onCopy={copy}
              />
            ))}
          </ul>
          <p className="card-note" style={{ margin: 0 }}>
            Visitas = aberturas do link (no máximo 1 por dia por navegador; vale o primeiro link aberto naquele
            navegador). Ativos 7d = vinculados que abriram o app nos últimos 7 dias. O canal vem do link usado
            (?origem=); prefira os links por canal para saber de onde vem cada cadastro.
          </p>
        </>
      )}

      <h2 className="section-label">Gerenciar o programa</h2>
      <p className="card-note" style={{ margin: '-8px 0 0' }}>
        No app, cada um tem o próprio modo (Embaixador ou Influenciador) com os números (sem saber quem se cadastrou),
        metas, ranking do mês com o próprio grupo, o material de divulgação e os recados enviados aqui.
      </p>

      <div className="two-col">
        <form className="card stack" onSubmit={handleCreate}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Adicionar ao programa</h2>
            <p className="card-note" style={{ margin: '4px 0 0' }}>A pessoa precisa ter conta no app.</p>
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Tipo</span>
              <select className="input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </label>
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
              <span className="card-note" style={{ margin: 0, overflowWrap: 'anywhere' }}>
                {form.code ? ambassadorLink(form.code) : 'O código vira o link de divulgação.'}
              </span>
              <button className="btn btn--primary" type="submit" disabled={busy || !isValidCode(form.code)}>Criar {kindLabel(form.kind).toLowerCase()}</button>
            </div>
          </div>
        </form>

        <ProgramMessageForm
          counts={Object.fromEntries(MESSAGE_AUDIENCES.map(g => [g.key, rows.filter(a => a.kind === g.kind && a.active && a.userId).length]))}
          loading={loading}
        />
      </div>

      <PromoMaterialsAdmin />

      {msg && (
        <div className="toast" role="status">
          <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>
        </div>
      )}
    </div>
  );
}

function AmbassadorCard({ a, open, editing, busy, onToggle, onEdit, onEditChange, onCancel, onSave, onCopy }) {
  const conv = conversion(a.visits, a.signups);
  return (
    <li className="card pcard" style={{ '--stat-cols': 5 }}>
      <div className="pcard__head">
        <div className="pcard__id">
          <div className="pcard__title">
            <strong className="pcard__name">{a.name}</strong>
            <span className={`badge ${a.kind === 'influenciador' ? 'badge--warning' : 'badge--admin'}`}>{kindLabel(a.kind)}</span>
            {!a.active && <span className="badge badge--danger">inativo</span>}
          </div>
          <div className="pcard__meta">
            <span>{a.userId ? <Link to={`/users/${a.userId}`}>{a.email}</Link> : 'conta excluída'}</span>
            <span>Código <code>{a.code}</code></span>
          </div>
        </div>
        {!editing && (
          <div className="actions-row pcard__actions">
            <button className="btn btn--small" aria-expanded={open} onClick={onToggle}>
              {open ? 'Fechar' : `Vinculados (${a.total})`}
            </button>
            <button className="btn btn--ghost btn--small" onClick={onEdit}>Editar</button>
            <button className={`btn btn--small ${a.active ? 'btn--danger' : 'btn--ghost'}`} disabled={busy}
              onClick={() => onSave({ active: !a.active })}>
              {a.active ? 'Desativar' : 'Reativar'}
            </button>
          </div>
        )}
      </div>

      {editing && (
        <form className="pcard__edit form-grid"
          onSubmit={e => { e.preventDefault(); onSave({ name: editing.name, code: editing.code, kind: editing.kind }); }}>
          <label className="field">
            <span className="field__label">Nome</span>
            <input className="input" value={editing.name} onChange={e => onEditChange({ ...editing, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Tipo</span>
            <select className="input" value={editing.kind} onChange={e => onEditChange({ ...editing, kind: e.target.value })}>
              {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Código</span>
            <input className="input" value={editing.code}
              onChange={e => onEditChange({ ...editing, code: e.target.value.toLowerCase() })} />
          </label>
          <div className="form-grid__actions">
            <span className="card-note" style={{ margin: 0, overflowWrap: 'anywhere' }}>{ambassadorLink(editing.code)}</span>
            <div className="actions-row">
              <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>Cancelar</button>
              <button type="submit" className="btn btn--primary btn--small" disabled={busy || !isValidCode(editing.code) || !editing.name.trim()}>Salvar</button>
            </div>
          </div>
        </form>
      )}

      <dl className="pcard__stats">
        <PersonStat label="Visitas" value={a.visits} sub="no período" />
        <PersonStat label="Cadastros" value={a.signups} sub="no período" />
        <PersonStat label="Conversão" value={conv == null ? '—' : `${conv}%`} sub="visita → cadastro" />
        <PersonStat label="Vinculados" value={a.total} sub="no total" />
        <PersonStat label="Ativos 7d" value={a.active7} sub="abriram o app" />
      </dl>

      {open && (
        <section className="pcard__panel">
          <h3 className="subsection-title">Copiar link de divulgação</h3>
          <div className="actions-row">
            {CHANNELS.map(c => (
              <button key={c.key} className="btn btn--ghost btn--small" disabled={!a.active}
                onClick={() => onCopy(ambassadorLink(a.code, c.key))}>{c.label}</button>
            ))}
          </div>
          {!a.active && <p className="card-note">{kindLabel(a.kind)} inativo: o link não vincula novas contas.</p>}
          <h3 className="subsection-title">Contas vinculadas</h3>
          <ReferralList ambassadorId={a.id} />
        </section>
      )}
    </li>
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
    <div className="table-wrap">
      <table className="resp-table">
        <thead><tr><th>Usuário</th><th>Canal</th><th>Cadastro</th><th>E-mail confirmado</th><th>Último acesso</th><th>Treinos</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.userId}>
              <td data-label="Usuário">
                <Link to={`/users/${r.userId}`}>{r.email}</Link>
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
    </div>
  );
}

// Recado para um grupo do programa (só os ativos): chega por push (se a pessoa
// ativou as notificações) e fica na aba Recados do modo Embaixador/Influenciador.
function ProgramMessageForm({ counts, loading }) {
  const [audience, setAudience] = useState(MESSAGE_AUDIENCES[0].key);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const group = MESSAGE_AUDIENCES.find(g => g.key === audience);
  const count = counts[audience] || 0;
  const who = group.label.toLowerCase();

  async function handleSend(e) {
    e.preventDefault();
    if (!window.confirm(`Enviar este recado para ${count} ${who}?`)) return;
    setBusy(true);
    setResult('');
    try {
      const { recipients, sent } = await sendProgramMessage({ title, body, audience });
      setResult(`Recado enviado para ${recipients} ${who}; a notificação chegou em ${sent} aparelho(s).`);
      setTitle('');
      setBody('');
    } catch (err) {
      setResult(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={handleSend}>
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Recado para embaixadores ou influenciadores</h2>
        <p className="card-note" style={{ margin: '4px 0 0' }}>
          Campanhas, novidades e datas importantes. Vai para os {loading ? '…' : count} {who} ativos: notificação no
          celular (para quem ativou) e na aba Recados do modo {group.kind === 'embaixador' ? 'Embaixador' : 'Influenciador'}.
          O outro grupo não recebe.
        </p>
      </div>
      <label className="field">
        <span className="field__label">Para</span>
        <select className="input" value={audience} onChange={e => setAudience(e.target.value)}>
          {MESSAGE_AUDIENCES.map(g => (
            <option key={g.key} value={g.key}>{g.label} ({loading ? '…' : counts[g.key] || 0})</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Título</span>
        <input className="input" value={title} maxLength={MESSAGE_TITLE_MAX} placeholder="Ex.: Campanha de Black Friday"
          onChange={e => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Mensagem</span>
        <textarea className="input" rows={4} value={body} maxLength={MESSAGE_BODY_MAX}
          placeholder="O que você quer que eles saibam ou postem"
          onChange={e => setBody(e.target.value)} />
      </label>
      <div className="form-grid__actions">
        <span className="card-note" style={{ margin: 0 }}>{body.length}/{MESSAGE_BODY_MAX}</span>
        <button className="btn btn--primary" type="submit" disabled={busy || !count || !title.trim() || !body.trim()}>
          {busy ? 'Enviando…' : 'Enviar recado'}
        </button>
      </div>
      {result && <p className={`form-msg ${result.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{result}</p>}
    </form>
  );
}
