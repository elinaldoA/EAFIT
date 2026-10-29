import { useEffect, useState } from 'react';
import { fetchKpis, fetchActivityByDay, pctChange, stickiness } from '../lib/management';
import { toCsv, downloadCsv } from '../lib/csv';
import Loading from './Loading';
import LineChart from './charts/LineChart';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const SERIES = [
  { key: 'sessions', label: 'Treinos' },
  { key: 'active_users', label: 'Ativos' },
  { key: 'signups', label: 'Cadastros' },
];

function formatDay(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function fmt(value, suffix = '') {
  if (value === null || value === undefined) return '—';
  return `${value}${suffix}`;
}

function Delta({ cur, prev }) {
  const pct = pctChange(cur, prev);
  if (pct === null) {
    return <span className="delta delta--flat">{Number(cur) > 0 ? 'novo' : 'sem base'}</span>;
  }
  const cls = pct > 0 ? 'delta--up' : pct < 0 ? 'delta--down' : 'delta--flat';
  return <span className={`delta ${cls}`}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '●'} {Math.abs(pct)}% vs. período anterior</span>;
}

export default function KpiPanel() {
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState('sessions');
  const [kpis, setKpis] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([fetchKpis(days), fetchActivityByDay(days)])
      .then(([k, a]) => { if (active) { setKpis(k); setActivity(a); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  function exportActivity() {
    downloadCsv(`atividade_${days}d.csv`, toCsv(activity, [
      { key: 'day', label: 'Dia' }, { key: 'sessions', label: 'Treinos' },
      { key: 'active_users', label: 'UsuariosAtivos' }, { key: 'signups', label: 'Cadastros' },
    ]));
  }

  const cards = kpis ? [
    { label: 'Usuários ativos', value: kpis.active_cur, cur: kpis.active_cur, prev: kpis.active_prev, hint: 'treinaram no período' },
    { label: 'Treinos realizados', value: kpis.sessions_cur, cur: kpis.sessions_cur, prev: kpis.sessions_prev, hint: 'dias de treino' },
    { label: 'Novos cadastros', value: kpis.signups_cur, cur: kpis.signups_cur, prev: kpis.signups_prev, hint: 'sem contar admins' },
    { label: 'Nota média', value: fmt(kpis.rating_cur, ' / 5'), cur: kpis.rating_cur, prev: kpis.rating_prev, hint: 'avaliação dos treinos' },
    { label: 'Duração média', value: fmt(kpis.duration_min_cur, ' min'), cur: kpis.duration_min_cur, prev: kpis.duration_min_prev, hint: 'por treino' },
  ] : [];


  return (
    <div className="stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Visão gerencial</h2>
          <p className="section-hint">Desempenho do período comparado ao período anterior de mesmo tamanho.</p>
        </div>
        <div className="seg" role="group" aria-label="Período dos indicadores">
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

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : kpis && (
        <>
          <div className="tile-grid tile-grid--kpi">
            {cards.map(c => (
              <div className="tile tile--kpi" key={c.label}>
                <div className="tile__label">{c.label} · {c.hint}</div>
                <div className="tile__value">{c.value ?? '—'}</div>
                <Delta cur={c.cur} prev={c.prev} />
              </div>
            ))}
          </div>

          <h3 className="section-label">Frequência de uso</h3>
          <div className="tile-grid tile-grid--usage">
            <div className="tile">
              <div className="tile__value">{kpis.dau} · {kpis.wau} · {kpis.mau}</div>
              <div className="tile__label">Ativos hoje · 7 dias · 30 dias (DAU · WAU · MAU)</div>
            </div>
            <div className="tile">
              <div className="tile__value">{fmt(stickiness(kpis.dau, kpis.mau), '%')}</div>
              <div className="tile__label">DAU/MAU — frequência de uso</div>
            </div>
            <div className="tile">
              <div className="tile__value">{fmt(stickiness(kpis.wau, kpis.mau), '%')}</div>
              <div className="tile__label">WAU/MAU — retorno semanal</div>
            </div>
            <div className="tile">
              <div className="tile__value">{kpis.never_trained}</div>
              <div className="tile__label">Nunca treinaram (de {kpis.total_users} usuários)</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="section-title" style={{ margin: 0 }}>Atividade diária — últimos {days} dias</h2>
              <div className="actions-row">
                <div className="seg" role="group" aria-label="Série do gráfico">
                  {SERIES.map(s => (
                    <button
                      key={s.key} type="button" aria-pressed={series === s.key}
                      className={`seg__btn${series === s.key ? ' seg__btn--active' : ''}`}
                      onClick={() => setSeries(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <button className="btn btn--small" onClick={exportActivity} disabled={!activity.length}>Exportar CSV</button>
              </div>
            </div>
            <LineChart
              points={activity} series={[SERIES.find(s => s.key === series)]} height={180}
              label={a => formatDay(a.day)}
              ariaLabel={`${SERIES.find(s => s.key === series).label} por dia, últimos ${days} dias`}
            />
            <p className="card-note">
              "Ativo" e "treino" seguem a mesma regra do funil: concluiu o treino ou marcou ao menos uma série.
              Contas de admin ficam fora de todos os números.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
