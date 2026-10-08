import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  WEEKDAYS, fetchPlanSummary, fetchPlanBreakdown, fetchTrainingRhythm,
  buildBreakdown, fillBuckets, topBuckets, MIN_USERS_FOR_FLAG,
} from '../lib/planAnalytics';
import { fetchCardio } from '../lib/insights';
import Loading from '../components/Loading';

const DIMENSIONS = [
  { key: 'meta', title: 'Por objetivo' },
  { key: 'nivel', title: 'Por nível' },
];

const fmt = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

function BreakdownTable({ title, rows }) {
  return (
    <div className="card">
      <h2 className="section-title">{title}</h2>
      {!rows.length ? <p className="card-note">Sem dados.</p> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead>
              <tr>
                <th>Grupo</th><th>Usuários</th><th>Treinaram (30d)</th><th>Nunca treinaram</th>
                <th>Treinos/semana</th><th>Aderência ao plano</th><th>Relatos de dor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.value}>
                  <td data-label="Grupo" style={{ textTransform: 'capitalize' }}>{r.value}</td>
                  <td data-label="Usuários">{r.users}</td>
                  <td data-label="Treinaram (30d)">{r.trained30d} <span className="user-detail__meta">({fmt(r.trainedPct, '%')})</span></td>
                  <td data-label="Nunca treinaram">{r.neverTrained}</td>
                  <td data-label="Treinos/semana">{fmt(r.sessionsPerWeek)}</td>
                  <td data-label="Aderência ao plano">
                    {fmt(r.adherencePct, '%')}
                    {r.isWorst && <span className="badge badge--danger">menor aderência</span>}
                  </td>
                  <td data-label="Relatos de dor">
                    {r.painUsers > 0 ? <span className="badge badge--warning">{r.painUsers} ({r.painPct}%)</span> : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Bars({ buckets, label, ariaLabel }) {
  const max = Math.max(1, ...buckets.map(b => b.sessions));
  return (
    <div className="bar-chart" role="img" aria-label={ariaLabel}>
      {buckets.map(b => (
        <div className="bar-chart__col" key={b.bucket} title={`${label(b.bucket)}: ${b.sessions} treino(s)`}>
          <span className="bar-chart__count">{b.sessions > 0 ? b.sessions : ''}</span>
          <div className="bar-chart__bar" style={{ height: `${Math.max(3, (b.sessions / max) * 100)}%` }} />
          <span className="bar-chart__day">{label(b.bucket)}</span>
        </div>
      ))}
    </div>
  );
}

// Cardio é registrado à parte das séries de força (duração e distância), então
// tem bloco próprio. Carrega sozinho: se falhar, o resto da página continua.
function CardioCard() {
  const [cardio, setCardio] = useState(null);

  useEffect(() => {
    let active = true;
    fetchCardio(30).then(c => { if (active) setCardio(c); }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!cardio) return null;
  const { total, exercises } = cardio;

  return (
    <div className="card">
      <h2 className="section-title">Cardio (30 dias)</h2>
      {total.sessions === 0 ? <p className="card-note" style={{ marginTop: 0 }}>Nenhum cardio registrado no período.</p> : (
        <>
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{total.sessions}</div><div className="tile__label">treinos com cardio</div></div>
            <div className="tile"><div className="tile__value">{total.users}</div><div className="tile__label">usuários</div></div>
            <div className="tile"><div className="tile__value">{total.minutes} min</div><div className="tile__label">tempo total</div></div>
            <div className="tile"><div className="tile__value">{String(total.km).replace('.', ',')} km</div><div className="tile__label">distância total</div></div>
          </div>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="resp-table">
              <thead><tr><th>Atividade</th><th>Treinos</th><th>Usuários</th><th>Minutos</th><th>Km</th></tr></thead>
              <tbody>
                {exercises.map(e => (
                  <tr key={e.exercise}>
                    <td data-label="Atividade">{e.exercise}</td>
                    <td data-label="Treinos">{e.sessions}</td>
                    <td data-label="Usuários">{e.users}</td>
                    <td data-label="Minutos">{e.minutes}</td>
                    <td data-label="Km">{String(e.km).replace('.', ',')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="card-note">Itens do plano registrados com duração ou distância (esteira, corrida, bike…).</p>
    </div>
  );
}

export default function PlanAnalytics() {
  const [summary, setSummary] = useState(null);
  const [breakdown, setBreakdown] = useState({ meta: [], nivel: [] });
  const [rhythm, setRhythm] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetchPlanSummary(), fetchPlanBreakdown(), fetchTrainingRhythm(90)])
      .then(([s, b, r]) => {
        if (!active) return;
        setSummary(s);
        setBreakdown(buildBreakdown(b));
        setRhythm(r);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  const weekdays = fillBuckets(rhythm, 'weekday', 7);
  const hours = fillBuckets(rhythm, 'hour', 24);
  const bestDays = topBuckets(weekdays, 2).map(b => WEEKDAYS[b.bucket]);
  const bestHours = topBuckets(hours, 2).map(b => `${String(b.bucket).padStart(2, '0')}h`);

  const tiles = summary ? [
    { label: 'Usuários com plano ativo', value: `${summary.users_with_plan} de ${summary.users_total}` },
    { label: 'Sem plano ativo', value: summary.users_without_plan },
    { label: 'Planos vencidos (ainda ativos)', value: summary.expired_active },
    { label: 'Vencem em 7 dias', value: summary.expiring_7d },
    { label: 'Com próximo plano definido', value: fmt(summary.chained_pct, '%') },
    { label: 'Duração média do ciclo', value: summary.avg_cycle_weeks ? `${summary.avg_cycle_weeks} sem.` : '—' },
  ] : [];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Análise dos planos</h1>
          <p className="page-subtitle">
            Como os planos de treino estão funcionando: quem tem plano, quanto cada grupo realmente treina e quando.
            Contas de admin ficam de fora.
          </p>
        </div>
      </div>

      <div className="tile-grid">
        {tiles.map(t => (
          <div className="tile" key={t.label}>
            <div className="tile__value">{t.value}</div>
            <div className="tile__label">{t.label}</div>
          </div>
        ))}
      </div>

      {Number(summary?.expired_active) > 0 && (
        <Link to="/engajamento" className="card" style={{ display: 'block', borderColor: 'var(--warning)' }}>
          <strong>{summary.expired_active} plano(s) já venceram e continuam ativos</strong>
          <span className="user-detail__meta"> — ver em Engajamento para renovar</span>
        </Link>
      )}

      {DIMENSIONS.map(d => <BreakdownTable key={d.key} title={d.title} rows={breakdown[d.key]} />)}
      <p className="card-note" style={{ marginTop: -8 }}>
        Aderência = treinos feitos nos últimos 30 dias ÷ treinos planejados (dias de força do plano ativo × semanas),
        com teto de 100% por usuário. "Menor aderência" só é marcada em grupos com {MIN_USERS_FOR_FLAG}+ usuários.
      </p>

      <div className="two-col">
        <div className="card">
          <h2 className="section-title">Treinos por dia da semana</h2>
          <Bars buckets={weekdays} label={b => WEEKDAYS[b]} ariaLabel="Treinos por dia da semana, últimos 90 dias" />
          <p className="card-note">
            Últimos 90 dias.{bestDays.length > 0 && <> Dias mais fortes: <strong>{bestDays.join(' e ')}</strong>.</>}
          </p>
        </div>
        <div className="card">
          <h2 className="section-title">Treinos por horário</h2>
          <Bars buckets={hours} label={b => String(b).padStart(2, '0')} ariaLabel="Treinos por horário do dia, últimos 90 dias" />
          <p className="card-note">
            Só treinos iniciados no modo ao vivo.{bestHours.length > 0 && <> Horários mais fortes: <strong>{bestHours.join(' e ')}</strong>.</>}
            {' '}Use isso para ajustar o horário das <Link to="/automacoes">notificações automáticas</Link>.
          </p>
        </div>
      </div>

      <CardioCard />
    </div>
  );
}
