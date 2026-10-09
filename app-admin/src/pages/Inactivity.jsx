import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { REASON_LABELS, SEGMENT_LABELS, fetchInactivityAnswers, fetchInactivitySummary } from '../lib/inactivity';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

// Respostas da pesquisa "por que você parou?", enviada pelo e-mail semanal a
// quem passou de 4 semanas sem treinar (uma vez por período parado).
export default function Inactivity() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetchInactivitySummary(), fetchInactivityAnswers()])
      .then(([summary, answers]) => { if (active) setData({ summary, answers }); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const summary = data?.summary;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Por que pararam</h1>
          <p className="page-subtitle">
            Quem passa de 4 semanas sem treinar recebe, no e-mail de segunda, a pergunta sobre o motivo, com resposta em
            um toque. O texto muda para quem sumiu do app (30 dias ou mais sem abrir) e para quem continua entrando sem
            treinar. Cada pessoa recebe uma vez por período parado.
          </p>
        </div>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && summary.sent === 0 && (
        <EmptyState icon="✉️" label="Nenhuma pesquisa enviada ainda. O primeiro envio sai na próxima segunda de manhã." />
      )}

      {!loading && !error && summary.sent > 0 && (
        <>
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{summary.sent}</div><div className="tile__label">pesquisas enviadas</div></div>
            <div className="tile">
              <div className="tile__value">{summary.answered}</div>
              <div className="tile__label">respostas ({summary.rate}% de quem recebeu)</div>
            </div>
            {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
              <div className="tile" key={key}>
                <div className="tile__value">{summary.segments[key].answered} / {summary.segments[key].sent}</div>
                <div className="tile__label">{label}: respostas / envios</div>
              </div>
            ))}
          </div>

          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr><th>Motivo</th><th>Respostas</th><th>% das respostas</th><th>{SEGMENT_LABELS.absent}</th><th>{SEGMENT_LABELS.idle}</th></tr>
              </thead>
              <tbody>
                {summary.reasons.map(r => (
                  <tr key={r.reason}>
                    <td data-label="Motivo">{r.label}</td>
                    <td data-label="Respostas">{r.total}</td>
                    <td data-label="% das respostas">{r.share}%</td>
                    <td data-label={SEGMENT_LABELS.absent}>{r.absent}</td>
                    <td data-label={SEGMENT_LABELS.idle}>{r.idle}</td>
                  </tr>
                ))}
                {summary.reasons.length === 0 && (
                  <tr><td colSpan={5}><EmptyState icon="⏳" label="Ninguém respondeu ainda." /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data.answers.length > 0 && (
            <div className="table-wrap">
              <table className="resp-table">
                <thead><tr><th>Quando</th><th>Quem</th><th>Situação</th><th>Motivo</th><th>Comentário</th></tr></thead>
                <tbody>
                  {data.answers.map(a => (
                    <tr key={a.id}>
                      <td data-label="Quando">{formatDate(a.answeredAt)}</td>
                      <td data-label="Quem"><Link to={`/users/${a.userId}`}>{a.name || a.email}</Link></td>
                      <td data-label="Situação">
                        {SEGMENT_LABELS[a.segment] || a.segment} · {a.neverTrained ? 'nunca treinou' : `${a.days} dias sem treinar`}
                      </td>
                      <td data-label="Motivo">{REASON_LABELS[a.reason] || a.reason}</td>
                      <td data-label="Comentário">{a.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
