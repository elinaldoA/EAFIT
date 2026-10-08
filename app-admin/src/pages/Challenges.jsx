import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TITLE_MAX, DURATION_OPTIONS, STATUS_LABEL, STATUS_BADGE,
  todayStr, formatDay, challengeStatus, validateOfficialChallenge, participationPct, friendlyCommunityError,
  fetchChallenges, fetchChallengeLeaderboard, createOfficialChallenge, deleteChallenge,
} from '../lib/community';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

function Leaderboard({ challengeId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchChallengeLeaderboard(challengeId)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [challengeId]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <p className="user-detail__meta">Ninguém entrou ainda.</p>;

  return (
    <table className="resp-table">
      <thead><tr><th>Participante</th><th>Dias treinados</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.userId}>
            <td data-label="Participante">
              <Link className="btn btn--ghost btn--small" to={`/users/${r.userId}`}>{r.name}</Link>
              {r.role === 'coach' && <span className="badge badge--admin">personal</span>}
              <div className="user-detail__meta">{r.email}</div>
            </td>
            <td data-label="Dias treinados">{r.role === 'coach' ? '—' : r.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OfficialChallengeForm({ onCreated }) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(todayStr());
  const [days, setDays] = useState(DURATION_OPTIONS[1]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [code, setCode] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const check = validateOfficialChallenge(title, start, days);
    if (!check.ok) { setMsg(`Erro: ${check.error}`); return; }
    setBusy(true);
    setMsg('');
    setCode('');
    try {
      setCode(await createOfficialChallenge(check.title, check.start, check.end));
      setTitle('');
      await onCreated();
    } catch (err) {
      setMsg(`Erro: ${friendlyCommunityError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Novo desafio oficial</h2>
        <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
          Um desafio do EAFIT, sem limite de participantes. Quem recebe o código entra pelo app em
          Dashboard → Treinos → Desafios. Vence quem treinar mais dias no período.
        </p>
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Nome</span>
          <input className="input" maxLength={TITLE_MAX} value={title} onChange={e => setTitle(e.target.value)} placeholder="Desafio de outubro" />
        </label>
        <label className="field">
          <span className="field__label">Início</span>
          <input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <div className="field">
          <span className="field__label">Duração</span>
          <div className="seg" role="group" aria-label="Duração">
            {DURATION_OPTIONS.map(d => (
              <button
                key={d} type="button" aria-pressed={days === d}
                className={`seg__btn${days === d ? ' seg__btn--active' : ''}`}
                onClick={() => setDays(d)}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="actions-row">
        <button className="btn btn--primary btn--small" type="submit" disabled={busy}>Criar desafio</button>
        {msg && <span className="form-msg form-msg--error">{msg}</span>}
      </div>
      {code && (
        <p className="form-msg form-msg--ok">
          Desafio criado. Código de convite: <code>{code}</code>. Divulgue em{' '}
          <Link to="/notificacoes">Enviar notificação</Link> ou no aviso do app.
        </p>
      )}
    </form>
  );
}

export default function Challenges() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await fetchChallenges());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(c) {
    if (!window.confirm(`Apagar o desafio "${c.title}"? Ele some do app de todos os ${c.members} participante(s).`)) return;
    setMsg('');
    try {
      await deleteChallenge(c.id);
      setMsg('Desafio apagado.');
      await load();
    } catch (err) {
      setMsg(`Erro: ${friendlyCommunityError(err)}`);
    }
  }

  const today = todayStr();
  const running = rows.filter(c => challengeStatus(c, today) === 'ativo');
  const tiles = [
    { label: 'Desafios em andamento', value: running.length },
    { label: 'Participantes em andamento', value: running.reduce((n, c) => n + c.members, 0) },
    { label: 'Desafios oficiais', value: rows.filter(c => c.official).length },
  ];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Desafios</h1>
          <p className="page-subtitle">
            Desafios criados pelos usuários, pelos personais e pelo EAFIT. O placar é de dias treinados no período.
          </p>
        </div>
      </div>

      <OfficialChallengeForm onCreated={load} />

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      {!loading && !error && (
        <>
          <div className="tile-grid">
            {tiles.map(t => (
              <div className="tile" key={t.label}>
                <div className="tile__value">{t.value}</div>
                <div className="tile__label">{t.label}</div>
              </div>
            ))}
          </div>

          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Desafio</th><th>Período</th><th>Situação</th><th>Participantes</th><th>Treinaram</th><th>Criado por</th><th /></tr></thead>
              <tbody>
                {rows.map(c => {
                  const status = challengeStatus(c, today);
                  const pct = participationPct(c.members, c.active);
                  return (
                    <tr key={c.id}>
                      <td data-label="Desafio">
                        <strong>{c.title}</strong>
                        {c.official && <span className="badge badge--admin">oficial</span>}
                        <div className="user-detail__meta">código <code>{c.code}</code></div>
                        {open === c.id && <Leaderboard challengeId={c.id} />}
                      </td>
                      <td data-label="Período">{formatDay(c.start)} a {formatDay(c.end)}</td>
                      <td data-label="Situação"><span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span></td>
                      <td data-label="Participantes">{c.members}</td>
                      <td data-label="Treinaram">{c.active}{pct !== null && <span className="user-detail__meta"> ({pct}%)</span>}</td>
                      <td data-label="Criado por">
                        {c.official ? 'EAFIT' : c.ownerId
                          ? <Link className="btn btn--ghost btn--small" to={`/users/${c.ownerId}`}>{c.ownerEmail}</Link>
                          : '—'}
                      </td>
                      <td>
                        <div className="actions-row">
                          <button className="btn btn--small" onClick={() => setOpen(open === c.id ? null : c.id)}>
                            {open === c.id ? 'Ocultar placar' : 'Ver placar'}
                          </button>
                          <button className="btn btn--danger btn--small" onClick={() => handleDelete(c)}>Apagar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7}><EmptyState icon="🏁" label="Nenhum desafio criado ainda." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
