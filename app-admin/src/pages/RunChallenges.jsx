import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  METRIC_LABEL, METRIC_UNIT, TITLE_MAX, DESC_MAX, EMPTY_CHALLENGE, toDraft, validateChallenge, challengeSituation, goalText, valueText,
  friendlyChallengeError, fetchRunChallengesAdmin, saveRunChallenge, setRunChallengeActive, deleteRunChallenge,
  fetchRunChallengeReport, removeRunChallengeMember,
} from '../lib/runChallenges';
import { todayStr, formatDay, STATUS_LABEL, STATUS_BADGE } from '../lib/community';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { useConfirm } from '../context/confirmContext';

function ChallengeForm({ editing, onCancel, onSaved }) {
  const [draft, setDraft] = useState(editing ? toDraft(editing) : { ...EMPTY_CHALLENGE, start_date: todayStr() });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const err = k => errors[k] && <span className="form-msg form-msg--error" role="alert">{errors[k]}</span>;

  async function handleSubmit(e) {
    e.preventDefault();
    const { ok, errors: errs, value } = validateChallenge(draft);
    setErrors(errs);
    if (!ok) return;
    setBusy(true);
    setMsg('');
    try {
      await saveRunChallenge(editing?.id, value);
      await onSaved();
    } catch (error) {
      setMsg(`Erro: ${friendlyChallengeError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ margin: 0 }}>{editing ? `Editar: ${editing.title}` : 'Novo desafio do Run'}</h2>
      <div className="form-grid">
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Nome</span>
          <input className="input" value={draft.title} maxLength={TITLE_MAX} placeholder="Desafio de dezembro: 100 km" onChange={e => set('title', e.target.value)} />
          {err('title')}
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Descrição (opcional)</span>
          <textarea className="input" rows={2} value={draft.description} maxLength={DESC_MAX} placeholder="Na rua ou na esteira: conta toda corrida que você registrar no app." onChange={e => set('description', e.target.value)} />
          {err('description')}
        </label>
        <label className="field">
          <span className="field__label">Tipo da meta</span>
          <select className="input" value={draft.metric} onChange={e => set('metric', e.target.value)}>
            {Object.entries(METRIC_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {err('metric')}
        </label>
        <label className="field">
          <span className="field__label">Meta ({METRIC_UNIT[draft.metric]})</span>
          <input className="input" inputMode="decimal" value={draft.goal} placeholder={draft.metric === 'km' ? '100' : draft.metric === 'hours' ? '10' : '12'} onChange={e => set('goal', e.target.value)} />
          {err('goal')}
        </label>
        <label className="field">
          <span className="field__label">Início</span>
          <input className="input" type="date" value={draft.start_date} onChange={e => set('start_date', e.target.value)} />
          {err('start_date')}
        </label>
        <label className="field">
          <span className="field__label">Fim</span>
          <input className="input" type="date" value={draft.end_date} onChange={e => set('end_date', e.target.value)} />
          {err('end_date')}
        </label>
      </div>
      <p className="card-note">
        O app mostra o desafio assim que ele é criado (mesmo antes do início). Conta toda corrida registrada no período, inclusive as de
        esteira e as lançadas à mão — por isso confira o ranking de vez em quando. Para avisar a base, use{' '}
        <Link to="/notificacoes">Enviar notificação</Link>.
      </p>
      {msg && <p className="form-msg form-msg--error" role="alert">{msg}</p>}
      <div className="actions-row">
        <button className="btn btn--primary btn--small" type="submit" disabled={busy}>{editing ? 'Salvar' : 'Criar desafio'}</button>
        <button className="btn btn--ghost btn--small" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function Report({ challenge }) {
  const ask = useConfirm();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await fetchRunChallengeReport(challenge.id));
      setError('');
    } catch (err) {
      setError(friendlyChallengeError(err));
    }
  }, [challenge.id]);
  useEffect(() => { load(); }, [load]);

  async function remove(r) {
    if (!await ask({ title: 'Tirar do desafio', message: `Tirar ${r.name} (${r.email}) do desafio? Ela some do ranking, mas pode entrar de novo pelo app.`, confirmLabel: 'Tirar do desafio', danger: true })) return;
    try {
      await removeRunChallengeMember(challenge.id, r.userId);
      await load();
    } catch (err) {
      setError(friendlyChallengeError(err));
    }
  }

  if (error) return <p className="form-msg form-msg--error" role="alert">{error}</p>;
  if (!rows) return <Loading />;
  if (!rows.length) return <p className="user-detail__meta">Ninguém entrou ainda.</p>;
  return (
    <table className="resp-table">
      <thead><tr><th scope="col">#</th><th scope="col">Participante</th><th scope="col">Total</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.userId}>
            <td data-label="#">{r.rank}º</td>
            <td data-label="Participante">
              <Link className="btn btn--ghost btn--small" to={`/users/${r.userId}`}>{r.name}</Link>
              <div className="user-detail__meta">{r.email}</div>
            </td>
            <td data-label="Total">
              {valueText(challenge.metric, r.value)}
              {r.value >= challenge.goal && <span className="badge badge--ok">meta batida</span>}
            </td>
            <td><button className="btn btn--ghost btn--small" onClick={() => remove(r)}>Tirar</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RunChallenges() {
  const ask = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchRunChallengesAdmin());
      setError('');
    } catch (err) {
      setError(friendlyChallengeError(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(c) {
    setMsg('');
    try {
      await setRunChallengeActive(c.id, !c.active);
      setMsg(c.active ? `"${c.title}" escondido do app.` : `"${c.title}" voltou para o app.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${friendlyChallengeError(err)}`);
    }
  }

  async function handleDelete(c) {
    if (!await ask({ title: 'Apagar desafio', message: `Apagar "${c.title}"? Ele some do app de todos os ${c.members} participante(s). Não dá para desfazer. Para só tirar do ar, use "Esconder".`, confirmLabel: 'Apagar desafio', danger: true, reauth: true })) return;
    setMsg('');
    try {
      await deleteRunChallenge(c.id);
      setMsg('Desafio apagado.');
      await load();
    } catch (err) {
      setMsg(`Erro: ${friendlyChallengeError(err)}`);
    }
  }

  async function handleSaved() {
    setForm(null);
    setMsg('Salvo.');
    await load();
  }

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error" role="alert">{error}</p>;

  const today = todayStr();
  const running = rows.filter(c => c.active && challengeSituation(c, today) === 'ativo');
  const tiles = [
    { label: 'Desafios em andamento', value: running.length },
    { label: 'Participantes em andamento', value: running.reduce((n, c) => n + c.members, 0) },
    { label: 'Desafios criados', value: rows.length },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Desafios do Run</h1>
          <p className="page-subtitle">
            Desafios de km, horas ou número de corridas para a comunidade do EAFIT Run. Quem usa o app entra com um toque e o progresso sai das próprias corridas.
          </p>
        </div>
        <button className="btn btn--primary btn--small" onClick={() => { setForm({ editing: null }); setMsg(''); }}>Novo desafio</button>
      </div>

      {form && <ChallengeForm key={form.editing?.id || 'new'} editing={form.editing} onCancel={() => setForm(null)} onSaved={handleSaved} />}

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}

      <div className="tile-grid">
        {tiles.map(t => (
          <div className="tile" key={t.label}>
            <div className="tile__value">{t.value}</div>
            <div className="tile__label">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        {!rows.length ? (
          <EmptyState icon="🏆" label="Nenhum desafio criado ainda." />
        ) : (
          <div className="table-wrap">
            <table className="resp-table" aria-label="Desafios do Run">
              <thead>
                <tr><th scope="col">Desafio</th><th scope="col">Meta</th><th scope="col">Período</th><th scope="col">Situação</th><th scope="col">Participantes</th><th scope="col"></th></tr>
              </thead>
              <tbody>
                {rows.map(c => {
                  const status = challengeSituation(c, today);
                  return (
                    <tr key={c.id}>
                      <td data-label="Desafio">
                        <strong>{c.title}</strong>
                        {!c.active && <span className="badge">escondido</span>}
                        {c.description && <div className="user-detail__meta">{c.description}</div>}
                        {open === c.id && <Report challenge={c} />}
                      </td>
                      <td data-label="Meta">{goalText(c)}<div className="user-detail__meta">{METRIC_LABEL[c.metric]}</div></td>
                      <td data-label="Período">{formatDay(c.start_date)} a {formatDay(c.end_date)}</td>
                      <td data-label="Situação"><span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span></td>
                      <td data-label="Participantes">{c.members}</td>
                      <td data-label="">
                        <div className="actions-row">
                          <button className="btn btn--small" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Ocultar ranking' : 'Ver ranking'}</button>
                          <button className="btn btn--ghost btn--small" onClick={() => { setForm({ editing: c }); setMsg(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                          <button className="btn btn--ghost btn--small" onClick={() => toggleActive(c)}>{c.active ? 'Esconder' : 'Mostrar'}</button>
                          <button className="btn btn--ghost btn--small" onClick={() => handleDelete(c)}>Apagar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
