import { useEffect, useState } from 'react';
import { fetchKpis, fetchActivityByDay, pctChange, stickiness } from '../lib/management';
import { toCsv, downloadCsv } from '../lib/csv';
import Loading from './Loading';

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

  const max = Math.max(1, ...activity.map(a => Number(a[series])));
  const labelEvery = Math.ceil(activity.length / 12);

  return (
    <div className="stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Visão gerencial</h2>
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
          <div className="tile-grid">
            {cards.map(c => (
              <div className="tile" key={c.label}>
                <div className="tile__value">{c.value ?? '—'}</div>
                <div className="tile__label">{c.label} · {c.hint}</div>
                <Delta cur={c.cur} prev={c.prev} />
              </div>
            ))}
          </div>

          <div className="tile-grid">
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
            <div className="bar-chart" role="img" aria-label={`${SERIES.find(s => s.key === series).label} por dia, últimos ${days} dias`}>
              {activity.map((a, i) => (
                <div className="bar-chart__col" key={a.day} title={`${formatDay(a.day)}: ${a[series]}`}>
                  <span className="bar-chart__count">{days <= 14 && Number(a[series]) > 0 ? a[series] : ''}</span>
                  <div className="bar-chart__bar" style={{ height: `${Math.max(3, (Number(a[series]) / max) * 100)}%` }} />
                  <span className="bar-chart__day">{i % labelEvery === 0 ? formatDay(a.day) : ''}</span>
                </div>
              ))}
            </div>
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
