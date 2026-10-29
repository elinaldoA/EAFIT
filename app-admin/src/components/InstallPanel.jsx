import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchInstallSummary, fetchInstallDaily, fetchInstallByOs, fetchPushStaleRecent, fetchInstallByBrowser,
  fetchInstallByOrigin, fetchInstallRetention, fetchInstallDevices, fetchInstallCompare,
  buildInstallSummary, buildInstallCompare, buildByOs, buildByBrowser, buildByOrigin, buildRetention, buildFunnel,
  buildDevices, activeDays, formatDay, formatDateTime, PLATFORM_LABELS,
} from '../lib/installs';
import { trend, trendLabel } from '../lib/geo';
import { toCsv, downloadCsv } from '../lib/csv';
import PeriodChart from './PeriodChart';
import Donut from './charts/Donut';
import Loading from './Loading';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const TABS = [
  { key: 'dia', label: 'Por dia' },
  { key: 'sistema', label: 'Sistema e navegador' },
  { key: 'retencao', label: 'Retenção' },
  { key: 'origem', label: 'Origem' },
  { key: 'recentes', label: 'Instalações recentes' },
  { key: 'parados', label: 'Pararam de abrir' },
];

const fmtDay = day => day.split('-').reverse().slice(0, 2).join('/');
const pctText = v => (v == null ? '—' : `${v}%`);
const optional = promise => promise.catch(() => null);

// Variação sobre o período anterior. `bad`: quando subir é ruim (desinstalações).
function Trend({ cur, prev, days, bad }) {
  const t = trend({ cur, prev });
  if (!t) return null;
  const dir = bad && (t.dir === 'up' || t.dir === 'down') ? (t.dir === 'up' ? 'down' : 'up') : t.dir;
  return <span className={`geo-trend geo-trend--${dir}`} title={`Em relação aos ${days} dias anteriores`}>{trendLabel(t)}</span>;
}

function Bars({ rows }) {
  return (
    <ul className="dist">
      {rows.map(r => (
        <li key={r.key}>
          <div className="dist__row">
            <span className="dist__label">{r.label}</span>
            <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.min(100, Math.max(2, r.pct ?? 0))}%` }} /></span>
            <span className="dist__end"><span className="dist__value">{r.total}{r.pct != null ? ` · ${r.pct}%` : ''}</span></span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeviceTable({ rows, empty }) {
  if (!rows.length) return <p className="card-note" style={{ marginTop: 0 }}>{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="resp-table">
        <thead>
          <tr><th>Instalou em</th><th>Aparelho</th><th>Como</th><th>Dias de uso</th><th>Último acesso</th><th>Conta</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.installedAt}-${i}`}>
              <td data-label="Instalou em">{formatDay(r.installedAt)}</td>
              <td data-label="Aparelho">{r.os} · {r.browser}</td>
              <td data-label="Como">{r.source}</td>
              <td data-label="Dias de uso">{r.openDays}</td>
              <td data-label="Último acesso">{formatDay(r.lastOpen)}</td>
              <td data-label="Conta">{r.userId ? <Link to={`/users/${r.userId}`}>{r.name || 'Conta'}</Link> : 'Sem conta'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Dashboard → Instalações: quantos instalaram o app, como e quando, se continuam
// usando e os indícios de quem desinstalou.
export default function InstallPanel() {
  const [days, setDays] = useState(30);
  const [customDays, setCustomDays] = useState('');
  const [round, setRound] = useState(0);
  const [tab, setTab] = useState('dia');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    // Resumo, dia a dia, sistema e desinstalações são o essencial; o resto é extra
    // e, se falhar (banco sem a migration), o painel segue sem o bloco.
    Promise.all([
      fetchInstallSummary(days), fetchInstallDaily(days), fetchInstallByOs(days), fetchPushStaleRecent(20),
      optional(fetchInstallCompare(days)), optional(fetchInstallByBrowser(days)), optional(fetchInstallByOrigin(days)),
      optional(fetchInstallRetention(days)), optional(fetchInstallDevices('recent', 20)), optional(fetchInstallDevices('inactive', 30)),
    ])
      .then(([s, d, o, r, cmp, br, org, ret, rec, ina]) => {
        if (!active) return;
        const summary = buildInstallSummary(s);
        const retention = buildRetention(ret);
        setData({
          summary, retention, daily: d || [], activeDaily: activeDays(d), byOs: buildByOs(o), recent: r,
          compare: buildInstallCompare(cmp), byBrowser: buildByBrowser(br), byOrigin: buildByOrigin(org),
          funnel: buildFunnel(summary, retention), recentInstalls: buildDevices(rec), inactive: buildDevices(ina),
        });
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, round]);

  const s = data?.summary;
  const cmp = data?.compare;
  const tiles = s ? [
    { label: 'Instalações novas no período', value: s.installs, prev: cmp?.installs },
    { label: 'Abriram pelo ícone pela 1ª vez', value: s.firstOpens, prev: cmp?.firstOpens },
    { label: 'Instalados em uso (abriram pelo ícone em 30 dias)', value: s.active30 },
    { label: 'Instalados sem abrir pelo ícone há 30+ dias', value: s.inactive30 },
    { label: 'Indícios de desinstalação no período', value: s.pushStale, prev: cmp?.pushStale, bad: true },
  ] : [];

  const dailyChart = useMemo(() => (data ? {
    installs: data.daily.map(d => ({ key: d.day, label: fmtDay(d.day), total: Number(d.installs) || 0 })),
    stale: data.daily.map(d => ({ key: d.day, label: fmtDay(d.day), total: Number(d.push_stale) || 0 })),
  } : null), [data]);
  const range = data?.daily.length ? { from: fmtDay(data.daily[0].day), to: fmtDay(data.daily[data.daily.length - 1].day) } : null;

  const tabs = TABS.filter(t => {
    if (!data) return false;
    if (t.key === 'retencao') return data.retention.hasData;
    if (t.key === 'origem') return data.byOrigin.length > 0;
    if (t.key === 'recentes') return data.recentInstalls.length > 0;
    if (t.key === 'parados') return data.inactive.length > 0;
    return true;
  });
  const activeTab = tabs.some(t => t.key === tab) ? tab : 'dia';

  const exportCsv = () => {
    if (!data || !s) return;
    const rows = [
      { tipo: 'Resumo', nome: 'Instalações novas', total: s.installs, anterior: cmp?.installs ?? '' },
      { tipo: 'Resumo', nome: 'Abriram pelo ícone pela 1ª vez', total: s.firstOpens, anterior: cmp?.firstOpens ?? '' },
      { tipo: 'Resumo', nome: 'Instalados em uso (30 dias)', total: s.active30 },
      { tipo: 'Resumo', nome: 'Sem abrir há 30+ dias', total: s.inactive30 },
      { tipo: 'Resumo', nome: 'Indícios de desinstalação', total: s.pushStale, anterior: cmp?.pushStale ?? '' },
      ...data.funnel.map(f => ({ tipo: 'Funil', nome: f.label, total: f.total, extra: pctText(f.pct) })),
      ...data.byOs.map(o => ({ tipo: 'Sistema', nome: o.label, total: o.installs, extra: o.installedTotal, uso: o.active30, desinstalacao: o.pushStale })),
      ...data.byBrowser.map(b => ({ tipo: 'Navegador', nome: b.label, total: b.installs, extra: b.installedTotal, uso: b.active30 })),
      ...data.byOrigin.map(o => ({ tipo: 'Origem', nome: o.label, total: o.installs, uso: o.active30 })),
      ...data.activeDaily.map(d => ({ tipo: 'Dia', nome: formatDay(d.day), total: d.installs, desinstalacao: d.pushStale })),
    ];
    downloadCsv(`instalacoes_${days}d.csv`, toCsv(rows, [
      { key: 'tipo', label: 'Tipo' }, { key: 'nome', label: 'Item' }, { key: 'total', label: 'Total no período' },
      { key: 'anterior', label: `${days} dias anteriores` }, { key: 'extra', label: 'Instalados (total) / % da etapa' },
      { key: 'uso', label: 'Em uso (30 dias)' }, { key: 'desinstalacao', label: 'Indícios de desinstalação' },
    ]));
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="panel-head panel-head--flush">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Instalações do app</h2>
            <p className="section-hint">Quantas pessoas instalam o EAFIT, como chegam até a instalação e quantas ficam.</p>
          </div>
          <div className="geo-controls">
            <div className="seg" role="group" aria-label="Período">
              {PERIODS.map(p => (
                <button
                  key={p.days} type="button" aria-pressed={days === p.days}
                  className={`seg__btn${days === p.days ? ' seg__btn--active' : ''}`}
                  onClick={() => { setDays(p.days); setCustomDays(''); }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <form
              className="geo-custom"
              onSubmit={e => {
                e.preventDefault();
                const n = Math.floor(Number(customDays));
                if (n >= 1 && n <= 366) setDays(n);
              }}
            >
              <label>
                Últimos{' '}
                <input
                  type="number" min="1" max="366" inputMode="numeric" className="input geo-custom__input"
                  value={customDays} placeholder={PERIODS.some(p => p.days === days) ? '…' : String(days)}
                  onChange={e => setCustomDays(e.target.value)} onBlur={e => e.currentTarget.form.requestSubmit()}
                />{' '}
                dias
              </label>
            </form>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setRound(r => r + 1)} disabled={loading}>Atualizar</button>
            <button type="button" className="btn btn--ghost btn--small" onClick={exportCsv} disabled={!s}>Exportar CSV</button>
          </div>
        </div>
      </div>

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : !s ? (
        <div className="card"><p className="card-note" style={{ margin: 0 }}>Sem dados.</p></div>
      ) : (
          <>
            <div className="tile-grid tile-grid--kpi">
              {tiles.map(t => (
                <div className="tile tile--kpi" key={t.label}>
                  <div className="tile__value">
                    {t.value}
                    {t.prev != null && <Trend cur={t.value} prev={t.prev} days={days} bad={t.bad} />}
                  </div>
                  <div className="tile__label">{t.label}</div>
                </div>
              ))}
            </div>
            <details className="geo-new">
              <summary>Como ler estes números</summary>
              <p className="card-note" style={{ marginTop: 6 }}>
              O EAFIT é instalado pelo navegador, então baixar e instalar são a mesma coisa. Nenhum navegador avisa a
              desinstalação: o indício é a inscrição de notificações que deixa de funcionar (o envio seguinte é
              recusado), o que também acontece quando a pessoa bloqueia as notificações — por isso é um indício, não
              uma contagem exata. Quem já tinha o app instalado antes desta medição não conta como instalação nova.
              {cmp && <> As setas comparam com os {days} dias anteriores.</>}
              </p>
            </details>

            <div className="two-col">
              <div className="card">
                <h3 className="dash-group__title">Do convite ao uso</h3>
                <Bars rows={data.funnel.map(f => ({ key: f.key, label: f.label, total: f.total, pct: f.pct }))} />
                <p className="card-note">
                  Cada % é sobre a etapa de cima (as duas últimas, sobre quem já tem 7 ou 30 dias de instalado). As
                  etapas contam eventos do período, não a mesma turma de pessoas, e o botão só existe no Chrome, Edge e
                  Samsung; no iPhone a tela mostra o passo a passo.
                </p>
              </div>
              <div className="card">
                <h3 className="dash-group__title">Tela "Instale o app"</h3>
                <div className="table-wrap">
                  <table className="source-table">
                    <tbody>
                      <tr><th scope="row">Viram a tela</th><td>{s.screen.shown}{cmp && <> <Trend cur={s.screen.shown} prev={cmp.shown} days={days} /></>}</td></tr>
                      <tr><th scope="row">Aceitaram no botão "Instalar app"</th><td>{s.screen.accepted}{cmp && <> <Trend cur={s.screen.accepted} prev={cmp.accepted} days={days} /></>}</td></tr>
                      <tr><th scope="row">Recusaram no botão</th><td>{s.screen.dismissed}</td></tr>
                      <tr><th scope="row">Taxa de aceite do botão</th><td>{pctText(s.screen.acceptedPct)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <h3 className="subsection-title">Como instalaram</h3>
                <div className="table-wrap">
                  <table className="source-table">
                    <tbody>
                      {s.sources.map(x => (
                        <tr key={x.key}><th scope="row">{x.label}</th><td>{x.total}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="card">
            <div className="seg geo-tabs geo-tabs--first" role="group" aria-label="Detalhes">
              {tabs.map(t => (
                <button
                  key={t.key} type="button" aria-pressed={activeTab === t.key}
                  className={`seg__btn${activeTab === t.key ? ' seg__btn--active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'dia' && (
              <div className="geo-detail">
                {range && (
                  <>
                    <PeriodChart title="Instalações por dia" series={dailyChart.installs} unit="instalações" from={range.from} to={range.to} />
                    <PeriodChart title="Indícios de desinstalação por dia" series={dailyChart.stale} unit="indícios" from={range.from} to={range.to} />
                  </>
                )}
                {data.activeDaily.length ? (
                  <div className="table-wrap">
                    <table className="source-table">
                      <thead><tr><th scope="col">Dia</th><th scope="col">Instalações</th><th scope="col">Indícios de desinstalação</th></tr></thead>
                      <tbody>
                        {data.activeDaily.map(d => (
                          <tr key={d.day}><th scope="row">{formatDay(d.day)}</th><td>{d.installs}</td><td>{d.pushStale}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma instalação ou desinstalação no período.</p>}
              </div>
            )}

            {activeTab === 'sistema' && (
              <div className="geo-detail">
                <h3 className="subsection-title" style={{ marginTop: 0 }}>Por sistema</h3>
                {data.byOs.length ? (
                  <div className="table-wrap">
                    <table className="source-table">
                      <thead>
                        <tr>
                          <th scope="col">Sistema</th><th scope="col">Instalados</th><th scope="col">Novos no período</th>
                          <th scope="col">Em uso (30 dias)</th><th scope="col">Indícios de desinstalação</th><th scope="col">Indícios ÷ instalados</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byOs.map(o => (
                          <tr key={o.os}>
                            <th scope="row">{o.label}</th>
                            <td>{o.installedTotal}</td><td>{o.installs}</td><td>{o.active30}</td><td>{o.pushStale}</td><td>{pctText(o.stalePct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma instalação registrada ainda.</p>}
                <p className="card-note">Indícios ÷ instalados pode passar de 100% porque os indícios incluem quem já tinha o app antes da medição, e quem bloqueou as notificações sem desinstalar.</p>
                {data.byBrowser.length > 0 && (
                  <>
                    <h3 className="subsection-title">Por navegador</h3>
                    <div className="table-wrap">
                      <table className="source-table">
                        <thead>
                          <tr><th scope="col">Navegador</th><th scope="col">Instalados</th><th scope="col">Novos no período</th><th scope="col">Em uso (30 dias)</th></tr>
                        </thead>
                        <tbody>
                          {data.byBrowser.map(b => (
                            <tr key={b.browser}><th scope="row">{b.label}</th><td>{b.installedTotal}</td><td>{b.installs}</td><td>{b.active30}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'retencao' && (
              <div className="geo-detail">
                <h3 className="subsection-title" style={{ marginTop: 0 }}>Quem continua abrindo</h3>
                <div className="table-wrap">
                  <table className="source-table">
                    <thead><tr><th scope="col">Depois de instalar</th><th scope="col">Ainda abriam</th><th scope="col">Instalações com essa idade</th><th scope="col">%</th></tr></thead>
                    <tbody>
                      {data.retention.returns.map(r => (
                        <tr key={r.days}>
                          <th scope="row">{r.days === 1 ? '1 dia' : `${r.days} dias`} ou mais</th>
                          <td>{r.total}</td><td>{r.base}</td><td>{pctText(r.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card-note">Das instalações novas do período, conta quem abriu o app pelo ícone pelo menos tantos dias depois de instalar. Só entram as que já têm essa idade.</p>
                <h3 className="subsection-title">Dias em que abriram pelo ícone</h3>
                <Donut rows={data.retention.distribution} ordered />
                <p className="card-note">Todos os instalados, desde o início da medição.</p>
              </div>
            )}

            {activeTab === 'origem' && (
              <div className="geo-detail">
                <h3 className="subsection-title" style={{ marginTop: 0 }}>De onde vieram as instalações</h3>
                <div className="table-wrap">
                  <table className="source-table">
                    <thead><tr><th scope="col">Origem</th><th scope="col">Instalações</th><th scope="col">%</th><th scope="col">Em uso (30 dias)</th></tr></thead>
                    <tbody>
                      {data.byOrigin.map(o => (
                        <tr key={o.source}><th scope="row">{o.label}</th><td>{o.installs}</td><td>{o.pct}%</td><td>{o.active30}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card-note">A origem é a do cadastro da conta (utm ou link de embaixador). Aparelhos que instalaram sem entrar numa conta não têm origem.</p>
              </div>
            )}

            {activeTab === 'recentes' && (
              <div className="geo-detail">
                <h3 className="subsection-title" style={{ marginTop: 0 }}>Últimas instalações</h3>
                <DeviceTable rows={data.recentInstalls} empty="Nenhuma instalação nova registrada ainda." />
              </div>
            )}

            {activeTab === 'parados' && (
              <div className="geo-detail">
                <h3 className="subsection-title" style={{ marginTop: 0 }}>Instalados que pararam de abrir</h3>
                <DeviceTable rows={data.inactive} empty="Todos os instalados abriram o app nos últimos 30 dias." />
                <p className="card-note">Instalados sem abrir pelo ícone há 30+ dias, do acesso mais recente pro mais antigo. Bons candidatos para uma campanha de volta.</p>
              </div>
            )}
            </div>
          </>
      )}

      {!loading && !error && data && (
        <div className="card">
          <h2 className="section-title">Últimos indícios de desinstalação</h2>
          {data.recent.length ? (
            <div className="table-wrap">
              <table className="resp-table">
                <thead>
                  <tr><th>Quando</th><th>Aparelho</th><th>Conta</th><th>Tinha ativado em</th><th>Ainda recebe em outro aparelho</th></tr>
                </thead>
                <tbody>
                  {data.recent.map((r, i) => (
                    <tr key={`${r.detected_at}-${i}`}>
                      <td data-label="Quando">{formatDateTime(r.detected_at)}</td>
                      <td data-label="Aparelho">{PLATFORM_LABELS[r.platform] || r.platform}</td>
                      <td data-label="Conta">{r.user_id ? <Link to={`/users/${r.user_id}`}>{r.nome || r.email || 'Conta'}</Link> : 'Conta excluída'}</td>
                      <td data-label="Tinha ativado em">{formatDay(r.subscribed_at)}</td>
                      <td data-label="Ainda recebe em outro aparelho">{r.still_has_push ? 'Sim' : 'Não'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhum indício registrado ainda. Ele aparece quando um envio de notificação é recusado pelo aparelho.</p>}
        </div>
      )}
    </div>
  );
}
