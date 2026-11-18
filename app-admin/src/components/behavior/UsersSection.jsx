import {
  formatSeconds, fetchClientBreakdown, groupDimension, OS_LABELS, BROWSER_LABELS, DEVICE_LABELS, LANG_LABELS, MODE_LABELS, PUSH_LABELS,
} from '../../lib/behavior';
import { Link } from 'react-router-dom';
import { fetchAdoption } from '../../lib/adoption';
import Donut from '../charts/Donut';
import { Card, Bars, Steps, DeltaBadge, CountTable } from './parts';
import { loadSessions, loadEvents, loadWorkouts, loadInstall } from './loaders';
import { useLoad } from './useLoad';

const usage = items => items.map(i => ({ key: i.key, label: i.label, total: i.users, pct: i.pct }));

export default function UsersSection({ days }) {
  const sessions = useLoad(loadSessions, days);
  const events = useLoad(loadEvents, days);
  const adoption = useLoad(fetchAdoption, days);
  const workouts = useLoad(loadWorkouts, days);
  const clients = useLoad(fetchClientBreakdown, days);
  const install = useLoad(loadInstall, 0);

  return (
    <>
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
                <div className="tile"><div className="tile__value">{data.sessions}</div><div className="tile__label">Sessões de {data.users} contas</div><DeltaBadge cur={data.sessions} prev={data.prevSessions} /></div>
                <div className="tile"><div className="tile__value">{data.perUser}</div><div className="tile__label">Sessões por conta</div></div>
                <div className="tile"><div className="tile__value">{formatSeconds(data.medianSeconds)}</div><div className="tile__label">Duração mediana</div></div>
                <div className="tile"><div className="tile__value">{data.avgScreens}</div><div className="tile__label">Telas por sessão</div></div>
                <div className="tile"><div className="tile__value">{data.multiDevicePct == null ? '—' : `${data.multiDevicePct}%`}</div><div className="tile__label">Usam 2+ aparelhos ({data.multiDeviceUsers})</div></div>
              </div>
              <div className="two-col">
                <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Duração da sessão</h3><Donut rows={data.durations} ordered label="Sessões" /></div>
                <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Sessões por conta</h3><Donut rows={data.perUserBands} ordered label="Contas" /></div>
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
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Sistema</h3><Donut rows={groupDimension(rows, 'os', OS_LABELS, 'users')} label="Usuários" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Navegador</h3><Donut rows={groupDimension(rows, 'browser', BROWSER_LABELS, 'users')} label="Usuários" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Aparelho</h3><Donut rows={groupDimension(rows, 'device', DEVICE_LABELS, 'users')} label="Usuários" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Instalado ou navegador</h3><Donut rows={groupDimension(rows, 'display_mode', MODE_LABELS, 'users')} label="Usuários" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Notificações</h3><Donut rows={groupDimension(rows, 'push_permission', PUSH_LABELS, 'users')} label="Usuários" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Versão do app</h3><Donut rows={groupDimension(rows, 'app_version', {}, 'users')} label="Usuários" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Idioma</h3><Donut rows={groupDimension(rows, 'lang', LANG_LABELS, 'users')} label="Usuários" /></div>
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
    </>
  );
}
