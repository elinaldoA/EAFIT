import { useEffect, useState } from 'react';
import { fetchFunnel, fetchVisitSources, fetchLandingEvents } from '../lib/dashboardStats';
import { buildFunnel, groupVisitSources, groupLandingEvents } from '../lib/activation';
import Loading from './Loading';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Todos' },
];

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function ActivationFunnel() {
  const [days, setDays] = useState(30);
  const [row, setRow] = useState(null);
  const [sources, setSources] = useState([]);
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([fetchFunnel(days), fetchVisitSources(days), fetchLandingEvents(days)])
      .then(([r, s, e]) => { if (active) { setRow(r); setSources(groupVisitSources(s)); setEvents(groupLandingEvents(e)); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const { steps, worstKey } = buildFunnel(row);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="section-title" style={{ margin: 0 }}>Funil de ativação</h2>
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

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : (
        <>
          <ol className="funnel">
            {steps.map((s, i) => (
              <li key={s.key} className={`funnel__step${s.key === worstKey ? ' funnel__step--worst' : ''}`}>
                <div className="funnel__label">
                  <span>{s.label}</span>
                  <strong>{s.count}</strong>
                </div>
                <div className="funnel__track">
                  <div className="funnel__bar" style={{ width: `${Math.max(s.count ? 2 : 0, Math.min(100, s.pctOfStart ?? 0))}%` }} />
                </div>
                <div className="funnel__meta">
                  {i === 0 ? 'base' : s.pctOfPrev == null ? '—' : `${s.pctOfPrev}% da etapa anterior`}
                  {s.key === worstKey && <span className="badge badge--danger">maior perda</span>}
                </div>
              </li>
            ))}
          </ol>

          <h3 className="subsection-title">De onde vieram as visitas</h3>
          {sources.length ? (
            <div className="table-wrap">
              <table className="source-table">
                <thead>
                  <tr><th scope="col">Origem</th><th scope="col">Landing</th><th scope="col">Tela de acesso</th><th scope="col">Total</th></tr>
                </thead>
                <tbody>
                  {sources.map(s => (
                    <tr key={s.source}>
                      <th scope="row">{s.label}</th>
                      <td>{s.landing}</td>
                      <td>{s.acesso}</td>
                      <td><strong>{s.total}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma visita registrada no período.</p>}

          <h3 className="subsection-title">O que fazem na landing</h3>
          {events && (events.clicks.length || events.reach.length || events.installClicks || events.installed) ? (
            <div className="table-wrap">
              <table className="source-table">
                <thead>
                  <tr><th scope="col">Evento</th><th scope="col">Sessões</th></tr>
                </thead>
                <tbody>
                  {events.clicks.map(c => (
                    <tr key={`c-${c.place}`}><th scope="row">Clique em “Começar/Criar conta” · {c.label}</th><td>{c.total}</td></tr>
                  ))}
                  {events.reach.map(r => (
                    <tr key={`r-${r.place}`}><th scope="row">{r.label}</th><td>{r.total}</td></tr>
                  ))}
                  {events.installClicks > 0 && <tr><th scope="row">Clicaram em “Instalar agora”</th><td>{events.installClicks}</td></tr>}
                  {events.installed > 0 && <tr><th scope="row">Instalaram o app</th><td>{events.installed}</td></tr>}
                </tbody>
              </table>
            </div>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhum evento registrado no período.</p>}
        </>
      )}

      <p className="card-note">
        Sem admins. Visitas são anônimas e contadas no máximo 1 vez por dia por navegador (eventos da landing: 1 vez por sessão)
        {row?.visits_since ? `, desde ${formatDate(row.visits_since)}` : ''} — cadastros anteriores a isso
        podem deixar a 1ª etapa menor que a 2ª. Treino = concluído, finalizado ou com ao menos uma série
        marcada. Cadastros recentes ainda podem avançar no funil.
      </p>
    </div>
  );
}
