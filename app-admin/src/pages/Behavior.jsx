import { useEffect, useMemo, useState } from 'react';
import {
  fetchVisitBreakdown, fetchSitePages, fetchUtmBreakdown, fetchEmailStats, buildEmailStats, fetchSessionStats, buildSessionStats, formatSeconds, fetchAuthEvents, fetchUserEvents, fetchClientBreakdown, fetchInstallRetention,
  fetchWorkoutCompletion, fetchWorkoutDropoff, fetchVisitorStages, fetchLostVisitors, fetchAccessTimeline,
  groupDimension, hourSeries, weekdaySeries, peakOf, buildSignup, buildUserEvents, buildInstallRetention, buildCompletion,
  buildVisitorJourney, stageLabel, authErrorLabel, buildAccessTimeline, timelineBuckets, TIMELINE_BUCKETS, TIMELINE_SPAN,
  OS_LABELS, BROWSER_LABELS, DEVICE_LABELS, LANG_LABELS, MODE_LABELS, PUSH_LABELS,
} from '../lib/behavior';
import { sourceLabel } from '../lib/activation';
import { formatDateTime } from '../lib/installs';
import { Link } from 'react-router-dom';
import { buildTutorialFunnel, fetchAdoption } from '../lib/adoption';
import Loading from '../components/Loading';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Todos' },
];

// Cada bloco carrega sozinho: se uma consulta falhar (ex.: migration ainda não
// aplicada), só aquele card mostra o erro e o resto da página continua.
// `load` é uma função fixa do módulo (recebe o período), pra dependência do
// efeito ser só o período.
function useLoad(load, days) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let active = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    load(days)
      .then(data => { if (active) setState({ loading: false, data, error: '' }); })
      .catch(err => { if (active) setState({ loading: false, data: null, error: err.message || 'Falha ao carregar.' }); });
    return () => { active = false; };
  }, [load, days]);
  return state;
}

const loadAuth = days => fetchAuthEvents(days).then(buildSignup);
const loadEvents = days => fetchUserEvents(days).then(rows => ({ ...buildUserEvents(rows), tutorial: buildTutorialFunnel(rows) }));
const loadJourney = days => Promise.all([fetchVisitorStages(days), fetchLostVisitors(days, 50)])
  .then(([stages, lost]) => ({ ...buildVisitorJourney(stages), recent: lost }));
const loadTimeline = ({ bucket, days }) => fetchAccessTimeline(bucket, timelineBuckets(bucket, days))
  .then(rows => buildAccessTimeline(rows, bucket));
const loadSessions = days => fetchSessionStats(days).then(buildSessionStats);
const loadEmails = days => fetchEmailStats(days).then(buildEmailStats);
const loadInstall = () => fetchInstallRetention().then(buildInstallRetention);
const loadWorkouts = days => Promise.all([fetchWorkoutCompletion(days), fetchWorkoutDropoff(days, 10)])
  .then(([c, d]) => ({ completion: buildCompletion(c), dropoff: d }));

function Card({ title, state, note, children }) {
  return (
    <div className="card">
      <h2 className="section-title">{title}</h2>
      {state.loading ? <Loading /> : state.error ? <p className="form-msg form-msg--error">{state.error}</p> : children(state.data)}
      {note && <p className="card-note">{note}</p>}
    </div>
  );
}

function Bars({ rows, unit = '', empty = 'Sem dados no período.' }) {
  if (!rows?.length || rows.every(r => !r.total)) return <p className="card-note" style={{ marginTop: 0 }}>{empty}</p>;
  return (
    <ul className="dist">
      {rows.map(r => (
        <li key={r.value ?? r.key} className="dist__row">
          <span className="dist__label" title={r.label}>{r.label}</span>
          <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(r.total ? 2 : 0, r.pct ?? 0)}%` }} /></span>
          <span className="dist__value">{r.total}{unit}{r.pct == null ? '' : ` · ${r.pct}%`}</span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ series, label }) {
  const max = Math.max(1, ...series.map(s => s.total));
  return (
    <div className="bar-chart" role="img" aria-label={label}>
      {series.map(s => (
        <div key={s.label} className="bar-chart__col" title={`${s.label}: ${s.total}`}>
          <span className="bar-chart__count">{s.total || ''}</span>
          <div className="bar-chart__bar" style={{ height: `${(s.total / max) * 100}%` }} />
          <span className="bar-chart__day">{s.label.replace('h', '')}</span>
        </div>
      ))}
    </div>
  );
}

// Colunas empilhadas (app + site) com rótulo só de tantos em tantos
// intervalos, pra série por minuto (120 colunas) continuar legível.
function TimelineChart({ series }) {
  const max = Math.max(1, ...series.map(s => s.total));
  const every = Math.ceil(series.length / 12);
  return (
    <div className="bar-chart bar-chart--dense" role="img" aria-label="Acessos no tempo">
      {series.map((s, i) => (
        <div key={s.key} className="bar-chart__col" title={`${s.full}: ${s.app} no app, ${s.site} no site`}>
          <div className="bar-chart__stack" style={{ height: `${(s.total / max) * 100}%` }}>
            <div className="bar-chart__bar" style={{ flex: s.site }} />
            <div className="bar-chart__bar bar-chart__bar--app" style={{ flex: s.app }} />
          </div>
          <span className="bar-chart__day">{i % every === 0 ? s.label : ' '}</span>
        </div>
      ))}
    </div>
  );
}

function AccessTimeline({ days }) {
  const [bucket, setBucket] = useState('dia');
  const args = useMemo(() => ({ bucket, days }), [bucket, days]);
  const state = useLoad(loadTimeline, args);
  return (
    <Card
      title="Acessos no tempo" state={state}
      note="Horário de Brasília. Site = visitas anônimas à landing e à tela de acesso (1 por navegador por dia). App = aberturas por quem está logado, no máximo 1 a cada 5 minutos por pessoa; antes desta medição só se sabe o dia. Admins não entram."
    >
      {data => (
        <>
          <div className="card-head" style={{ marginBottom: 10 }}>
            <div className="seg" role="group" aria-label="Agrupar acessos">
              {TIMELINE_BUCKETS.map(b => (
                <button
                  key={b.key} type="button" aria-pressed={bucket === b.key}
                  className={`seg__btn${bucket === b.key ? ' seg__btn--active' : ''}`}
                  onClick={() => setBucket(b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {TIMELINE_SPAN[bucket] && <span className="card-note" style={{ margin: 0 }}>{TIMELINE_SPAN[bucket].note}</span>}
          </div>
          <div className="tile-grid" style={{ marginBottom: 14 }}>
            <div className="tile"><div className="tile__value">{data.app}</div><div className="tile__label">Aberturas do app</div></div>
            <div className="tile"><div className="tile__value">{data.site}</div><div className="tile__label">Visitas ao site</div></div>
            <div className="tile"><div className="tile__value">{data.peak ? data.peak.full : '—'}</div><div className="tile__label">Mais movimentado{data.peak ? ` (${data.peak.total})` : ''}</div></div>
          </div>
          <TimelineChart series={data.series} />
          <p className="card-note" style={{ margin: '6px 0 12px' }}>
            <span className="legend-dot legend-dot--app" /> App &nbsp; <span className="legend-dot" /> Site
          </p>
          <CountTable
            head={['Quando', 'App', 'Pessoas no app', 'Site']} empty="Nenhum acesso no período."
            rows={data.active.slice(0, 100).map(s => ({ key: s.key, label: s.full, cells: [s.app, s.users, s.site] }))}
          />
        </>
      )}
    </Card>
  );
}

function Steps({ steps }) {
  return (
    <ol className="funnel">
      {steps.map((s, i) => (
        <li key={s.key} className="funnel__step">
          <div className="funnel__label"><span>{s.label}</span><strong>{s.count}</strong></div>
          <div className="funnel__track">
            <div className="funnel__bar" style={{ width: `${Math.max(s.count ? 2 : 0, Math.min(100, s.pctOfStart ?? 0))}%` }} />
          </div>
          <div className="funnel__meta">{i === 0 ? 'base' : s.pctOfStart == null ? '—' : `${s.pctOfStart}% da 1ª etapa`}</div>
        </li>
      ))}
    </ol>
  );
}

function CountTable({ head, rows, empty }) {
  if (!rows.length) return <p className="card-note" style={{ marginTop: 0 }}>{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="source-table">
        <thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}><th scope="row">{r.label}</th>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const usage = items => items.map(i => ({ key: i.key, label: i.label, total: i.users, pct: i.pct }));

export default function Behavior() {
  const [days, setDays] = useState(30);

  const visits = useLoad(fetchVisitBreakdown, days);
  const sitePages = useLoad(fetchSitePages, days);
  const utm = useLoad(fetchUtmBreakdown, days);
  const auth = useLoad(loadAuth, days);
  const journey = useLoad(loadJourney, days);
  const events = useLoad(loadEvents, days);
  const clients = useLoad(fetchClientBreakdown, days);
  const sessions = useLoad(loadSessions, days);
  const emails = useLoad(loadEmails, days);
  const install = useLoad(loadInstall, 0);
  const workouts = useLoad(loadWorkouts, days);
  const adoption = useLoad(fetchAdoption, days);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Comportamento</h1>
          <p className="page-subtitle">
            O que visitantes e usuários fazem no app. Os dados começam a contar a partir da publicação desta tela;
            nada aqui guarda IP, modelo de aparelho ou user-agent.
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

      <div className="section-label">Visitantes (anônimo)</div>

      <Card
        title="Com o que acessam" state={visits}
        note="Visitas à landing e à tela de acesso, no máximo 1 por dia por navegador. Visitas antigas aparecem como “Não registrado”."
      >
        {rows => (
          <div className="two-col">
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Aparelho</h3><Bars rows={groupDimension(rows, 'device', DEVICE_LABELS)} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Navegador</h3><Bars rows={groupDimension(rows, 'browser', BROWSER_LABELS)} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Idioma</h3><Bars rows={groupDimension(rows, 'lang', LANG_LABELS)} /></div>
            <div>
              <h3 className="subsection-title" style={{ marginTop: 0 }}>Campanha (utm_campaign)</h3>
              <Bars rows={groupDimension(rows, 'campaign')} empty="Nenhuma visita veio com utm_campaign no link." />
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Páginas do site mais vistas" state={sitePages}
        note="Cada página conta 1 vez por sessão do navegador. “Navegadores” = identificadores distintos. Páginas do app e navegador de admin não entram."
      >
        {rows => (
          <CountTable
            head={['Página', 'Acessos', 'Navegadores']} empty="Nenhum acesso às páginas do site no período ainda."
            rows={rows.map(r => ({ key: r.path, label: r.path === 'home' ? 'Início' : `/${r.path}`, cells: [r.views, r.visitors] }))}
          />
        )}
      </Card>

      <Card
        title="Campanha × criativo" state={utm}
        note="utm_campaign, utm_medium e utm_content das visitas à landing e à tela de acesso. Só aparecem visitas com link marcado, a partir desta medição."
      >
        {rows => (
          <CountTable
            head={['Campanha', 'Meio (medium)', 'Criativo (content)', 'Visitas']} empty="Nenhuma visita com utm_campaign, utm_medium ou utm_content ainda."
            rows={rows.map(r => ({ key: `${r.campaign}|${r.medium}|${r.content}`, label: r.campaign || '—', cells: [r.medium || '—', r.content || '—', r.visits] }))}
          />
        )}
      </Card>

      <AccessTimeline days={days} />

      <Card title="Quando acessam" state={visits} note="Horário de Brasília.">
        {rows => {
          const hours = hourSeries(rows);
          const week = weekdaySeries(rows);
          const peakHour = peakOf(hours);
          const peakDay = peakOf(week);
          return (
            <>
              {peakHour && peakDay && (
                <p className="card-note" style={{ margin: '0 0 8px' }}>
                  Pico às <strong>{peakHour.label}</strong> e no dia <strong>{peakDay.label}</strong>.
                </p>
              )}
              <h3 className="subsection-title" style={{ marginTop: 0 }}>Por hora do dia</h3>
              <Columns series={hours} label="Visitas por hora do dia" />
              <h3 className="subsection-title">Por dia da semana</h3>
              <Bars rows={week.map(w => ({ value: w.day, label: w.label, total: w.total, pct: null }))} />
            </>
          );
        }}
      </Card>

      <Card
        title="Onde o cadastro trava" state={auth}
        note="Contado 1 vez por sessão do navegador. “Começaram a preencher” = digitaram e-mail ou senha na aba Criar conta."
      >
        {data => (
          <>
            <Steps steps={data.steps} />
            <h3 className="subsection-title">Erros ao criar conta</h3>
            <CountTable
              head={['Motivo', 'Sessões']} empty="Nenhum erro de cadastro no período."
              rows={data.signupErrors.map(e => ({ key: e.detail, label: e.label, cells: [e.total] }))}
            />
            <h3 className="subsection-title">Erros ao entrar</h3>
            <CountTable
              head={['Motivo', 'Sessões']} empty="Nenhum erro de login no período."
              rows={data.loginErrors.map(e => ({ key: e.detail, label: e.label, cells: [e.total] }))}
            />
          </>
        )}
      </Card>

      <Card
        title="Visitantes que não converteram" state={journey}
        note="Cada navegador é contado uma vez, pela etapa mais avançada a que chegou no período (site, tela de acesso e cadastro). “Converteu” = criou conta ou entrou numa conta que já tinha neste navegador. Nunca diz qual conta; só conta visitas a partir desta medição. Quem tem conta mas nunca entrou neste navegador aparece como não convertido."
      >
        {data => (data.total === 0
          ? <p className="card-note" style={{ marginTop: 0 }}>Nenhuma visita com identificador no período ainda.</p>
          : (
            <>
              <div className="tile-grid" style={{ marginBottom: 14 }}>
                <div className="tile"><div className="tile__value">{data.total}</div><div className="tile__label">Navegadores no período</div></div>
                <div className="tile"><div className="tile__value">{data.lostPct == null ? '—' : `${data.lostPct}%`}</div><div className="tile__label">Não converteram ({data.lost})</div></div>
                <div className="tile"><div className="tile__value">{data.lostReturningPct == null ? '—' : `${data.lostReturningPct}%`}</div><div className="tile__label">Desses, voltaram em 2+ dias ({data.lostReturning})</div></div>
                <div className="tile"><div className="tile__value">{data.converted}</div><div className="tile__label">Converteram</div></div>
              </div>
              <h3 className="subsection-title" style={{ marginTop: 0 }}>Até onde chegaram</h3>
              <CountTable
                head={['Etapa mais avançada', 'Navegadores', '% do total', 'Voltaram em 2+ dias']} empty=""
                rows={data.stages.map(s => ({ key: s.key, label: s.label, cells: [s.total, s.pct == null ? '—' : `${s.pct}%`, s.returning] }))}
              />
              <div className="two-col">
                <div>
                  <h3 className="subsection-title">Quantos dias vieram</h3>
                  <Bars rows={data.days} />
                </div>
                <div>
                  <h3 className="subsection-title">De onde vieram</h3>
                  <Bars rows={data.sources.map(s => ({ ...s, label: sourceLabel(s.value) }))} />
                </div>
                <div>
                  <h3 className="subsection-title">Aparelho</h3>
                  <Bars rows={data.devices} />
                </div>
              </div>
              <h3 className="subsection-title">Mais recentes</h3>
              {data.recent.length === 0
                ? <p className="card-note" style={{ marginTop: 0 }}>Ninguém deixou de converter no período.</p>
                : (
                  <div className="table-wrap">
                    <table className="resp-table">
                      <thead>
                        <tr><th>Navegador</th><th>Primeira visita</th><th>Última</th><th>Dias</th><th>Origem</th><th>Aparelho</th><th>Parou em</th><th>Último erro</th></tr>
                      </thead>
                      <tbody>
                        {data.recent.map(v => (
                          <tr key={v.lv_visitor}>
                            <td data-label="Navegador"><code>{v.lv_visitor}</code></td>
                            <td data-label="Primeira visita">{formatDateTime(v.lv_first_at)}</td>
                            <td data-label="Última">{formatDateTime(v.lv_last_at)}</td>
                            <td data-label="Dias">{v.lv_days}</td>
                            <td data-label="Origem">{sourceLabel(v.lv_source)}{v.lv_campaign ? ` · ${v.lv_campaign}` : ''}</td>
                            <td data-label="Aparelho">{DEVICE_LABELS[v.lv_device] || v.lv_device}</td>
                            <td data-label="Parou em">{stageLabel(v.lv_stage)}</td>
                            <td data-label="Último erro">{v.lv_error ? authErrorLabel(v.lv_error) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </>
          ))}
      </Card>

      <div className="section-label">E-mails</div>

      <Card
        title="E-mails enviados" state={emails}
        note="O Gmail não informa entrega nem abertura: aqui contam envios que saíram, falharam ou foram pulados (secrets não configurados). Os cliques aparecem em “Campanha × criativo” (a campanha é o tipo do e-mail) e na origem “email”. Vale a partir desta medição."
      >
        {data => (
          <>
            <div className="tile-grid" style={{ marginBottom: 14 }}>
              <div className="tile"><div className="tile__value">{data.sent}</div><div className="tile__label">Enviados no período</div></div>
              <div className="tile"><div className="tile__value">{data.sentToday}<small> / ~500</small></div><div className="tile__label">Hoje (limite do Gmail)</div></div>
              <div className="tile"><div className="tile__value">{data.errorPct == null ? '—' : `${data.errorPct}%`}</div><div className="tile__label">Falharam ({data.error})</div></div>
              <div className="tile"><div className="tile__value">{data.unsubscribed}</div><div className="tile__label">Descadastros</div></div>
            </div>
            <CountTable
              head={['Tipo', 'Enviados', 'Falharam', 'Pulados']} empty="Nenhum e-mail registrado no período ainda."
              rows={data.kinds.map(k => ({ key: k.kind, label: k.label, cells: [k.sent, k.error, k.skipped] }))}
            />
          </>
        )}
      </Card>

      <div className="section-label">Usuários registrados</div>

      <Card
        title="Sessões de uso" state={sessions}
        note="Uma sessão = uma visita ao app (do abrir ao sair da aba). A duração vai do primeiro ao último sinal e tem teto de 2 horas. Aparelho = o identificador do navegador; quem limpa os dados do navegador conta como outro. Sem admins; vale a partir desta medição."
      >
        {data => (data.sessions === 0
          ? <p className="card-note" style={{ marginTop: 0 }}>Nenhuma sessão registrada no período ainda.</p>
          : (
            <>
              <div className="tile-grid" style={{ marginBottom: 14 }}>
                <div className="tile"><div className="tile__value">{data.sessions}</div><div className="tile__label">Sessões de {data.users} contas</div></div>
                <div className="tile"><div className="tile__value">{data.perUser}</div><div className="tile__label">Sessões por conta</div></div>
                <div className="tile"><div className="tile__value">{formatSeconds(data.medianSeconds)}</div><div className="tile__label">Duração mediana</div></div>
                <div className="tile"><div className="tile__value">{data.avgScreens}</div><div className="tile__label">Telas por sessão</div></div>
                <div className="tile"><div className="tile__value">{data.multiDevicePct == null ? '—' : `${data.multiDevicePct}%`}</div><div className="tile__label">Usam 2+ aparelhos ({data.multiDeviceUsers})</div></div>
              </div>
              <div className="two-col">
                <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Duração da sessão</h3><Bars rows={data.durations} /></div>
                <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Sessões por conta</h3><Bars rows={data.perUserBands} /></div>
              </div>
            </>
          ))}
      </Card>

      <Card title="Onde o onboarding trava" state={events} note="Usuários que passaram por cada etapa do formulário de perfil no período. Sem admins.">
        {data => (
          <>
            <Steps steps={data.onboarding} />
            {data.onboardingErrors.length > 0 && (
              <>
                <h3 className="subsection-title">Erros no formulário</h3>
                <CountTable
                  head={['Motivo', 'Usuários']} empty=""
                  rows={data.onboardingErrors.map(e => ({ key: e.key, label: e.label, cells: [e.users] }))}
                />
              </>
            )}
          </>
        )}
      </Card>

      <Card
        title="Uso por funcionalidade" state={events}
        note="Usuários distintos que usaram cada item no período; % sobre os usuários ativos no período. Sem admins."
      >
        {data => (
          <>
            <p className="card-note" style={{ margin: '0 0 8px' }}>
              <strong>{data.active}</strong> usuários ativos no período
              {data.pushOpens.users > 0 && <> · <strong>{data.pushOpens.users}</strong> abriram o app por uma notificação ({data.pushOpens.pct}%)</>}
            </p>
            <div className="two-col">
              <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Telas abertas</h3><Bars rows={usage(data.pages)} /></div>
              <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Funcionalidades</h3><Bars rows={usage(data.features)} /></div>
            </div>
          </>
        )}
      </Card>

      <Card
        title="Adoção e retenção" state={adoption}
        note="Período anterior = o mesmo número de dias logo antes. Retenção = % que treinou nos últimos 7 dias, entre quem usou e entre os demais ativos do período. Usar e reter juntos não prova causa, mas mostra o que vale divulgar. No “Todos”, compara com os 30 dias."
      >
        {data => (
          <>
            {data.low.length > 0 && (
              <p className="card-note" style={{ margin: '0 0 8px' }}>
                <strong>Pouco descobertas</strong> (menos de 10% dos ativos): {data.low.map(i => i.label).join(', ')}.{' '}
                <Link to="/notificacoes">Divulgar com uma notificação</Link>
              </p>
            )}
            <div className="table-wrap">
              <table className="resp-table">
                <thead>
                  <tr><th>Funcionalidade</th><th>Usuários</th><th>% dos ativos</th><th>vs. anterior</th><th>Retenção de quem usou</th><th>Dos demais</th><th>Diferença</th></tr>
                </thead>
                <tbody>
                  {data.items.map(i => (
                    <tr key={i.key}>
                      <td data-label="Funcionalidade">{i.label}{i.low && <> <span className="badge badge--warning">pouco usada</span></>}</td>
                      <td data-label="Usuários">{i.users}</td>
                      <td data-label="% dos ativos">{i.pct == null ? '—' : `${i.pct}%`}</td>
                      <td data-label="vs. anterior">{i.change == null ? (i.users ? 'novo' : '—') : `${i.change > 0 ? '+' : ''}${i.change}%`}</td>
                      <td data-label="Retenção de quem usou">{i.usedRate == null ? '—' : `${i.usedRate}%`}</td>
                      <td data-label="Dos demais">{i.notUsedRate == null ? '—' : `${i.notUsedRate}%`}</td>
                      <td data-label="Diferença">{i.retentionLift == null ? '—' : `${i.retentionLift > 0 ? '+' : ''}${i.retentionLift} p.p.`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card
        title="Tutorial" state={events}
        note="Pessoas que viram cada passo do tutorial (o número é a posição na lista completa; passos de recursos desligados não aparecem). “Pularam aqui” = tocaram em Pular ou fecharam nesse passo."
      >
        {data => (data.tutorial.length === 0
          ? <p className="card-note" style={{ marginTop: 0 }}>Nenhum tutorial registrado no período.</p>
          : data.tutorial.map(f => (
            <div key={f.role} style={{ marginBottom: 12 }}>
              <h3 className="subsection-title" style={{ marginTop: 0 }}>
                {f.label}: {f.started} começaram · {f.done} concluíram{f.donePct == null ? '' : ` (${f.donePct}%)`}
                {f.worstStep && <> · mais desistências no passo {f.worstStep.n}</>}
              </h3>
              <Steps steps={f.steps.map(st => ({
                key: `${f.role}-${st.n}`, label: `Passo ${st.n}${st.skipped ? ` · ${st.skipped} pularam aqui` : ''}`,
                count: st.viewed, pctOfStart: st.pctOfStart,
              }))} />
            </div>
          )))}
      </Card>

      <Card
        title="Treinos iniciados × concluídos" state={workouts}
        note="Iniciado = começou o cronômetro ou marcou ao menos uma série. O dia de hoje fica fora (treino em andamento não é abandono). “Onde param” = último exercício com série feita nos treinos não concluídos."
      >
        {data => (
          <>
            <div className="tile-grid" style={{ marginBottom: 14 }}>
              <div className="tile"><div className="tile__value">{data.completion.started}</div><div className="tile__label">Treinos iniciados</div></div>
              <div className="tile"><div className="tile__value">{data.completion.pct == null ? '—' : `${data.completion.pct}%`}</div><div className="tile__label">Concluídos ({data.completion.completed})</div></div>
              <div className="tile"><div className="tile__value">{data.completion.abandoned}</div><div className="tile__label">Não concluídos</div></div>
              <div className="tile"><div className="tile__value">{data.completion.median}</div><div className="tile__label">Duração típica (média {data.completion.avg})</div></div>
            </div>
            <h3 className="subsection-title" style={{ marginTop: 0 }}>Onde param</h3>
            <CountTable
              head={['Exercício', 'Treinos']} empty="Nenhum treino abandonado com série feita no período."
              rows={data.dropoff.map(d => ({ key: d.exercise_name, label: d.exercise_name, cells: [d.total] }))}
            />
          </>
        )}
      </Card>

      <Card
        title="Aparelhos dos usuários" state={clients}
        note="Retrato do último acesso de cada usuário visto no período (sistema, navegador, versão do app e permissão de notificação). Sem admins."
      >
        {rows => (
          <div className="two-col">
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Sistema</h3><Bars rows={groupDimension(rows, 'os', OS_LABELS, 'users')} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Navegador</h3><Bars rows={groupDimension(rows, 'browser', BROWSER_LABELS, 'users')} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Aparelho</h3><Bars rows={groupDimension(rows, 'device', DEVICE_LABELS, 'users')} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Instalado ou navegador</h3><Bars rows={groupDimension(rows, 'display_mode', MODE_LABELS, 'users')} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Notificações</h3><Bars rows={groupDimension(rows, 'push_permission', PUSH_LABELS, 'users')} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Versão do app</h3><Bars rows={groupDimension(rows, 'app_version', {}, 'users')} /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Idioma</h3><Bars rows={groupDimension(rows, 'lang', LANG_LABELS, 'users')} /></div>
          </div>
        )}
      </Card>

      <Card title="App instalado retém mais?" state={install} note="Todos os usuários com acesso registrado, pelo modo do último acesso. Treinou = ao menos um treino nos últimos 7 dias.">
        {rows => (
          <CountTable
            head={['Modo', 'Usuários', 'Treinaram em 7 dias', '%']} empty="Sem dados ainda."
            rows={rows.filter(r => r.users > 0).map(r => ({ key: r.mode, label: r.label, cells: [r.users, r.trained, r.pct == null ? '—' : `${r.pct}%`] }))}
          />
        )}
      </Card>
    </div>
  );
}
