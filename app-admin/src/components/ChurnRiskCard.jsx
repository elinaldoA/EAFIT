import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Loading from './Loading';
import EmptyState from './EmptyState';
import { downloadCsv, toCsv } from '../lib/csv';
import {
  LEVEL_LABELS, REASON_LABELS, contactQueue, contactedRecently, fetchChurnRisk, riskLevel, sendRiskNudge, suggestedMessage,
} from '../lib/churnRisk';

const LEVEL_BADGE = { high: 'badge badge--danger', medium: 'badge badge--warning', low: 'badge badge--ok' };
const VIEWS = [
  { key: 'queue', label: 'Contatar hoje' },
  { key: 'high', label: 'Risco alto' },
  { key: 'all', label: 'Todos' },
];

const fmtDay = iso => (iso ? iso.split('-').reverse().join('/') : '—');

// Mensagem editável e envio em 1 clique (push + central de avisos do app).
function NudgeForm({ row, onSent, onCancel }) {
  const [msg, setMsg] = useState(() => suggestedMessage(row));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setSending(true);
    setError('');
    try {
      await sendRiskNudge(row.id, msg);
      onSent(row.id);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="field">
        <span className="field__label">Título</span>
        <input className="input" value={msg.title} onChange={e => setMsg({ ...msg, title: e.target.value })} maxLength={80} />
      </label>
      <label className="field">
        <span className="field__label">Mensagem</span>
        <textarea className="input" rows={2} value={msg.body} onChange={e => setMsg({ ...msg, body: e.target.value })} maxLength={240} />
      </label>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      <div className="actions-row">
        <button type="button" className="btn btn--primary btn--small" disabled={sending || !msg.title.trim() || !msg.body.trim()} onClick={send}>
          {sending ? 'Enviando…' : 'Enviar push'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export default function ChurnRiskCard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('queue');
  const [open, setOpen] = useState(null);
  const [sentIds, setSentIds] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    fetchChurnRisk()
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const queue = useMemo(() => contactQueue(rows), [rows]);
  const visible = view === 'queue' ? queue : view === 'high' ? rows.filter(r => riskLevel(r.score) === 'high') : rows;
  const counts = useMemo(() => rows.reduce((a, r) => ({ ...a, [riskLevel(r.score)]: a[riskLevel(r.score)] + 1 }), { high: 0, medium: 0, low: 0 }), [rows]);

  function handleSent(id) {
    setSentIds(prev => new Set(prev).add(id));
    setOpen(null);
  }

  function handleExport() {
    downloadCsv('previsao_abandono.csv', toCsv(
      visible.map(r => ({ ...r, motivos: r.reasons.map(k => REASON_LABELS[k] || k).join('; '), nivel: LEVEL_LABELS[riskLevel(r.score)] })),
      [
        { key: 'name', label: 'Nome' }, { key: 'email', label: 'Email' }, { key: 'score', label: 'Nota' },
        { key: 'nivel', label: 'Risco' }, { key: 'motivos', label: 'Motivos' }, { key: 'lastDay', label: 'UltimoTreino' },
        { key: 'daysSince', label: 'DiasSemTreinar' }, { key: 'typicalGap', label: 'IntervaloHabitual' },
        { key: 'recent14', label: 'Treinos14d' }, { key: 'prev14', label: 'Media14dAnterior' },
        { key: 'lastContact', label: 'UltimoAviso' },
      ],
    ));
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Previsão de abandono</h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
            Quem ainda treina, mas dá sinais de que vai parar: passou do próprio intervalo habitual, está treinando
            menos, com bem-estar baixo, dor, plano vencido ou sem abrir o app. Nota de 0 a 100.
          </p>
        </div>
        <div className="actions-row">
          <div className="seg" role="group" aria-label="Lista">
            {VIEWS.map(v => (
              <button
                key={v.key} type="button" aria-pressed={view === v.key}
                className={`seg__btn${view === v.key ? ' seg__btn--active' : ''}`}
                onClick={() => setView(v.key)}
              >{v.label}{v.key === 'queue' && !loading ? ` (${queue.length})` : ''}</button>
            ))}
          </div>
          <button className="btn btn--small" onClick={handleExport} disabled={!visible.length}>Exportar CSV</button>
        </div>
      </div>

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : (
        <>
          <div className="tile-grid" style={{ marginBottom: 12 }}>
            <div className="tile"><div className="tile__value">{counts.high}</div><div className="tile__label">risco alto (50+)</div></div>
            <div className="tile"><div className="tile__value">{counts.medium}</div><div className="tile__label">risco médio (25 a 49)</div></div>
            <div className="tile"><div className="tile__value">{queue.length}</div><div className="tile__label">para contatar hoje</div></div>
          </div>
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr><th>Usuário</th><th>Nota</th><th>Motivos</th><th>Último treino</th><th>Ritmo</th><th>Último aviso</th><th /></tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const level = riskLevel(r.score);
                  const sent = sentIds.has(r.id);
                  return (
                    <tr key={r.id}>
                      <td data-label="Usuário">
                        <Link to={`/users/${r.id}`}>{r.name}</Link>
                        {r.name !== r.email && <div className="user-detail__meta">{r.email}</div>}
                      </td>
                      <td data-label="Nota"><span className={LEVEL_BADGE[level]}>{r.score} · {LEVEL_LABELS[level]}</span></td>
                      <td data-label="Motivos">{r.reasons.map(k => REASON_LABELS[k] || k).join(' · ') || '—'}</td>
                      <td data-label="Último treino">
                        {fmtDay(r.lastDay)}
                        <div className="user-detail__meta">{r.daysSince} dia(s) · costuma treinar a cada {r.typicalGap}</div>
                      </td>
                      <td data-label="Ritmo">{r.recent14} em 14 dias{r.prev14 ? ` (antes: ${r.prev14})` : ''}</td>
                      <td data-label="Último aviso">
                        {sent ? <span className="badge badge--ok">enviado agora</span>
                          : r.lastContact ? new Date(r.lastContact).toLocaleDateString('pt-BR') + (contactedRecently(r) ? ' (recente)' : '') : '—'}
                      </td>
                      <td data-label="">
                        {open === r.id
                          ? <NudgeForm row={r} onSent={handleSent} onCancel={() => setOpen(null)} />
                          : <button type="button" className="btn btn--ghost btn--small" disabled={sent} onClick={() => setOpen(r.id)}>Mandar push</button>}
                      </td>
                    </tr>
                  );
                })}
                {!visible.length && (
                  <tr><td colSpan={7}><EmptyState icon="🎉" label={view === 'queue' ? 'Ninguém para contatar hoje.' : 'Ninguém nessa lista.'} /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="card-note">
            "Contatar hoje" = risco alto e nenhum aviso recebido nos últimos 3 dias. O push também fica na central de avisos do
            app e aparece em Comunicação → Resultados.
          </p>
        </>
      )}
    </div>
  );
}
