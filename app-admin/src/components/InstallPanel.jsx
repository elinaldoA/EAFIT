import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchInstallSummary, fetchInstallDaily, fetchInstallByOs, fetchPushStaleRecent,
  buildInstallSummary, buildByOs, activeDays, formatDay, formatDateTime, PLATFORM_LABELS,
} from '../lib/installs';
import Loading from './Loading';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

// Dashboard → Instalações: quantos instalaram o app, como e quando, e os
// indícios de quem desinstalou.
export default function InstallPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([fetchInstallSummary(days), fetchInstallDaily(days), fetchInstallByOs(days), fetchPushStaleRecent(20)])
      .then(([s, d, o, r]) => {
        if (active) setData({ summary: buildInstallSummary(s), daily: activeDays(d), byOs: buildByOs(o), recent: r });
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const s = data?.summary;
  const tiles = s ? [
    { label: 'Instalações novas no período', value: s.installs },
    { label: 'Abriram pelo ícone pela 1ª vez', value: s.firstOpens },
    { label: 'Instalados em uso (abriram pelo ícone em 30 dias)', value: s.active30 },
    { label: 'Instalados sem abrir pelo ícone há 30+ dias', value: s.inactive30 },
    { label: 'Indícios de desinstalação no período', value: s.pushStale },
  ] : [];

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2 className="section-title" style={{ margin: 0 }}>Instalações do app</h2>
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

        {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : !s ? (
          <p className="card-note">Sem dados.</p>
        ) : (
          <>
            <div className="tile-grid">
              {tiles.map(t => (
                <div className="tile" key={t.label}>
                  <div className="tile__value">{t.value}</div>
                  <div className="tile__label">{t.label}</div>
                </div>
              ))}
            </div>
            <p className="card-note">
              O EAFIT é instalado pelo navegador, então baixar e instalar são a mesma coisa. Nenhum navegador avisa a
              desinstalação: o indício é a inscrição de notificações que deixa de funcionar (o envio seguinte é
              recusado), o que também acontece quando a pessoa bloqueia as notificações. Quem já tinha o app instalado
              antes desta medição não conta como instalação nova.
            </p>

            <div className="two-col" style={{ marginTop: 20 }}>
              <div>
                <h3 className="subsection-title" style={{ marginTop: 0 }}>Tela "Instale o app"</h3>
                <div className="table-wrap">
                  <table className="source-table">
                    <tbody>
                      <tr><th scope="row">Viram a tela</th><td>{s.screen.shown}</td></tr>
                      <tr><th scope="row">Aceitaram no botão "Instalar app"</th><td>{s.screen.accepted}</td></tr>
                      <tr><th scope="row">Recusaram no botão</th><td>{s.screen.dismissed}</td></tr>
                      <tr><th scope="row">Taxa de aceite do botão</th><td>{s.screen.acceptedPct == null ? '—' : `${s.screen.acceptedPct}%`}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="card-note">O botão só existe no Chrome, Edge e Samsung; no iPhone a tela mostra o passo a passo.</p>
              </div>
              <div>
                <h3 className="subsection-title" style={{ marginTop: 0 }}>Como instalaram</h3>
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

            <h3 className="subsection-title">Por sistema</h3>
            {data.byOs.length ? (
              <div className="table-wrap">
                <table className="source-table">
                  <thead>
                    <tr><th scope="col">Sistema</th><th scope="col">Instalados</th><th scope="col">Novos no período</th><th scope="col">Em uso (30 dias)</th><th scope="col">Indícios de desinstalação</th></tr>
                  </thead>
                  <tbody>
                    {data.byOs.map(o => (
                      <tr key={o.os}>
                        <th scope="row">{o.label}</th>
                        <td>{o.installedTotal}</td><td>{o.installs}</td><td>{o.active30}</td><td>{o.pushStale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma instalação registrada ainda.</p>}

            <h3 className="subsection-title">Dia a dia</h3>
            {data.daily.length ? (
              <div className="table-wrap">
                <table className="source-table">
                  <thead><tr><th scope="col">Dia</th><th scope="col">Instalações</th><th scope="col">Indícios de desinstalação</th></tr></thead>
                  <tbody>
                    {data.daily.map(d => (
                      <tr key={d.day}><th scope="row">{formatDay(d.day)}</th><td>{d.installs}</td><td>{d.pushStale}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="card-note" style={{ marginTop: 0 }}>Nenhuma instalação ou desinstalação no período.</p>}
          </>
        )}
      </div>

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
