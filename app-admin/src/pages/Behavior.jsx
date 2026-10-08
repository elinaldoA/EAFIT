import { useEffect, useState } from 'react';
import {
  fetchVisitBreakdown, fetchAuthEvents, fetchUserEvents, fetchClientBreakdown, fetchInstallRetention,
  fetchWorkoutCompletion, fetchWorkoutDropoff,
  groupDimension, hourSeries, weekdaySeries, peakOf, buildSignup, buildUserEvents, buildInstallRetention, buildCompletion,
  OS_LABELS, BROWSER_LABELS, DEVICE_LABELS, LANG_LABELS, MODE_LABELS, PUSH_LABELS,
} from '../lib/behavior';
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
const loadEvents = days => fetchUserEvents(days).then(buildUserEvents);
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
  const auth = useLoad(loadAuth, days);
  const events = useLoad(loadEvents, days);
  const clients = useLoad(fetchClientBreakdown, days);
  const install = useLoad(loadInstall, 0);
  const workouts = useLoad(loadWorkouts, days);

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

      <div className="section-label">Usuários registrados</div>

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
