import { useEffect, useState } from 'react';
import { fetchFunnel, fetchVisitSources, fetchVisitOs, fetchLandingEvents } from '../lib/dashboardStats';
import { buildFunnel, groupVisitSources, groupVisitOs, groupLandingEvents } from '../lib/activation';
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
  const [systems, setSystems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    // Sistema operacional depende de uma migration mais nova: se a consulta
    // falhar, o resto do funil continua aparecendo.
    Promise.all([fetchFunnel(days), fetchVisitSources(days), fetchLandingEvents(days), fetchVisitOs(days).catch(() => null)])
      .then(([r, s, e, o]) => {
        if (!active) return;
        setRow(r); setSources(groupVisitSources(s)); setEvents(groupLandingEvents(e)); setSystems(o ? groupVisitOs(o) : null);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const { steps, worstKey } = buildFunnel(row);
  const worst = steps.find(x => x.key === worstKey);
  const byKey = Object.fromEntries(steps.map(x => [x.key, x]));
  const pctText = n => (n == null ? '—' : `${n}%`);
  const accountToWorkout = byKey.signed_up.count > 0 ? Math.round((byKey.first_workout.count / byKey.signed_up.count) * 100) : null;
  const summary = [
    { label: 'Visita → conta criada', value: pctText(byKey.signed_up.pctOfPrev), hint: `${byKey.signed_up.count} de ${byKey.visits.count}` },
    { label: 'Conta → 1º treino', value: pctText(accountToWorkout), hint: `${byKey.first_workout.count} de ${byKey.signed_up.count}` },
    { label: 'Maior perda do funil', value: worst ? `${100 - worst.pctOfPrev}% se perdem` : '—', hint: worst ? `na passagem para “${worst.label}”` : 'sem dados no período' },
  ];

  return (
    <div className="stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Funil de ativação</h2>
          <p className="section-hint">Do primeiro acesso ao hábito de treinar: onde as pessoas avançam e onde desistem.</p>
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

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : (
        <>
          <div className="tile-grid tile-grid--kpi">
            {summary.map(t => (
              <div className="tile tile--kpi" key={t.label}>
                <div className="tile__label">{t.label} · {t.hint}</div>
                <div className="tile__value">{t.value}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="dash-group__title">Etapas do funil</h3>
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
          </div>

          <div className="two-col">
            <div className="card">
              <h3 className="dash-group__title">De onde vieram as visitas</h3>
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
            </div>

            <div className="card">
              <h3 className="dash-group__title">De qual sistema acessam</h3>
              {!systems ? (
                <p className="card-note" style={{ marginTop: 0 }}>Dados de sistema indisponíveis no momento.</p>
              ) : systems.total ? (
                <>
                  {(systems.mobile.total > 0 || systems.desktop.total > 0) && (
                    <p className="card-note" style={{ margin: '0 0 8px' }}>
                      Celular <strong>{systems.mobile.pct}%</strong> ({systems.mobile.total}) · Desktop <strong>{systems.desktop.pct}%</strong> ({systems.desktop.total})
                    </p>
                  )}
                  <div className="table-wrap">
                    <table className="source-table">
                      <thead>
                        <tr><th scope="col">Sistema</th><th scope="col">Landing</th><th scope="col">Tela de acesso</th><th scope="col">Total</th><th scope="col">%</th></tr>
                      </thead>
                      <tbody>
                        {systems.systems.map(s => (
                          <tr key={s.os}>
                            <th scope="row">{s.label}</th>
                            <td>{s.landing}</td>
                            <td>{s.acesso}</td>
                            <td><strong>{s.total}</strong></td>
                            <td>{s.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma visita registrada no período.</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="dash-group__title">O que fazem na landing</h3>
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
          </div>
        </>
      )}

      <p className="card-note" style={{ margin: 0 }}>
        Sem admins. Visitas são anônimas e contadas no máximo 1 vez por dia por navegador (eventos da landing: 1 vez por sessão)
        {row?.visits_since ? `, desde ${formatDate(row.visits_since)}` : ''} — cadastros anteriores a isso
        podem deixar a 1ª etapa menor que a 2ª. Treino = concluído, finalizado ou com ao menos uma série
        marcada. Cadastros recentes ainda podem avançar no funil.
      </p>
    </div>
  );
}
