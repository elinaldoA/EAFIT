import {
  fetchVisitBreakdown, fetchUtmBreakdown, formatSeconds, groupDimension, hourSeries, weekdaySeries, peakOf, stageLabel, authErrorLabel, BROWSER_LABELS, DEVICE_LABELS, LANG_LABELS,
} from '../../lib/behavior';
import { sourceLabel } from '../../lib/activation';
import { formatDateTime } from '../../lib/installs';
import HeatStrip from '../charts/HeatStrip';
import Donut from '../charts/Donut';
import { Card, Steps, DeltaBadge, CountTable } from './parts';
import AccessTimeline from './AccessTimeline';
import { loadSitePages, loadAuth, loadJourney } from './loaders';
import { useLoad } from './useLoad';

export default function VisitorsSection({ days }) {
  const visits = useLoad(fetchVisitBreakdown, days);
  const sitePages = useLoad(loadSitePages, days);
  const utm = useLoad(fetchUtmBreakdown, days);
  const auth = useLoad(loadAuth, days);
  const journey = useLoad(loadJourney, days);

  return (
    <>
      <div className="section-label">Visitantes (anônimo)</div>

      <Card
        title="Com o que acessam" state={visits}
        note="Visitas à landing e à tela de acesso, no máximo 1 por dia por navegador. Visitas antigas aparecem como “Não registrado”."
      >
        {rows => (
          <div className="two-col">
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Aparelho</h3><Donut rows={groupDimension(rows, 'device', DEVICE_LABELS)} label="Visitas" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Navegador</h3><Donut rows={groupDimension(rows, 'browser', BROWSER_LABELS)} label="Visitas" /></div>
            <div><h3 className="subsection-title" style={{ marginTop: 0 }}>Idioma</h3><Donut rows={groupDimension(rows, 'lang', LANG_LABELS)} label="Visitas" /></div>
            <div>
              <h3 className="subsection-title" style={{ marginTop: 0 }}>Campanha (utm_campaign)</h3>
              <Donut rows={groupDimension(rows, 'campaign')} empty="Nenhuma visita veio com utm_campaign no link." label="Visitas" />
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Páginas do site mais vistas" state={sitePages}
        note="Cada página conta 1 vez por sessão do navegador. “Navegadores” = identificadores distintos. Tempo = aba visível até a primeira saída; rolagem = quanto da página chegou a aparecer; “Saíram rápido” = menos de 10s e menos de 25% da página. Quem volta à aba depois de sair não soma o tempo seguinte. Páginas do app e navegador de admin não entram."
      >
        {rows => (
          <CountTable
            csv="paginas-do-site"
            head={['Página', 'Acessos', 'Navegadores', 'Tempo mediano', 'Rolagem média', 'Saíram rápido']} empty="Nenhum acesso às páginas do site no período ainda."
            rows={rows.map(r => ({
              key: r.path,
              label: r.path === 'home' ? 'Início' : `/${r.path}`,
              cells: [
                <>{r.views}<DeltaBadge cur={r.views} prev={r.prevViews} /></>, r.visitors,
                r.medianSeconds == null ? '—' : formatSeconds(r.medianSeconds),
                r.avgScroll == null ? '—' : `${r.avgScroll}%`,
                r.quickPct == null ? '—' : `${r.quickPct}%`,
              ],
              csvCells: [
                r.views, r.visitors,
                r.medianSeconds == null ? '' : r.medianSeconds,
                r.avgScroll == null ? '' : r.avgScroll,
                r.quickPct == null ? '' : r.quickPct,
              ],
            }))}
          />
        )}
      </Card>

      <Card
        title="Campanha × criativo" state={utm}
        note="utm_campaign, utm_medium e utm_content das visitas à landing e à tela de acesso. Só aparecem visitas com link marcado, a partir desta medição."
      >
        {rows => (
          <CountTable
            csv="campanha-criativo"
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
              <HeatStrip cells={hours.map(h => ({ key: h.hour, label: h.label, total: h.total }))} unit="visitas" every={3} ariaLabel="Visitas por hora do dia" />
              <h3 className="subsection-title">Por dia da semana</h3>
              <HeatStrip cells={week.map(w => ({ key: w.day, label: w.label, total: w.total }))} unit="visitas" ariaLabel="Visitas por dia da semana" />
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
              csv="erros-de-cadastro"
              head={['Motivo', 'Sessões']} empty="Nenhum erro de cadastro no período."
              rows={data.signupErrors.map(e => ({ key: e.detail, label: e.label, cells: [e.total] }))}
            />
            <h3 className="subsection-title">Erros ao entrar</h3>
            <CountTable
              csv="erros-de-login"
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
                  <Donut rows={data.days} ordered label="Navegadores" />
                </div>
                <div>
                  <h3 className="subsection-title">De onde vieram</h3>
                  <Donut rows={data.sources.map(s => ({ ...s, label: sourceLabel(s.value) }))} label="Navegadores" />
                </div>
                <div>
                  <h3 className="subsection-title">Aparelho</h3>
                  <Donut rows={data.devices} label="Navegadores" />
                </div>
              </div>
              <h3 className="subsection-title">Mais recentes</h3>
              {data.recent.length === 0
                ? <p className="card-note" style={{ marginTop: 0 }}>Ninguém deixou de converter no período.</p>
                : (
                  <div className="table-wrap">
                    <table className="resp-table" aria-label="Mais recentes">
                      <thead>
                        <tr><th scope="col">Navegador</th><th scope="col">Primeira visita</th><th scope="col">Última</th><th scope="col">Dias</th><th scope="col">Origem</th><th scope="col">Aparelho</th><th scope="col">Parou em</th><th scope="col">Último erro</th></tr>
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
    </>
  );
}
