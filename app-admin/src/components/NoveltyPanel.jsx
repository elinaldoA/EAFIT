import { useEffect, useState } from 'react';
import { fetchNoveltyStats, buildNovelty } from '../lib/noveltyStats';
import Loading from './Loading';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const withPct = p => (p == null ? '' : ` · ${p}%`);

function Stat({ label, value, note }) {
  return (
    <div className="dash-stat">
      <dt>{label}</dt>
      <dd>{value}{note ? <small>{note}</small> : null}</dd>
    </div>
  );
}

function Bars({ rows }) {
  return (
    <ul className="dist">
      {rows.map(r => (
        <li key={r.key}>
          <div className="dist__row">
            <span className="dist__label">{r.label}</span>
            <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.min(100, Math.max(r.total > 0 ? 2 : 0, r.pct ?? 0))}%` }} /></span>
            <span className="dist__end"><span className="dist__value">{r.total}{withPct(r.pct)}</span></span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Adoção das funções novas. Só agregados: respostas do PAR-Q, lesões e medicamentos
// individuais não aparecem no painel (dado de saúde, LGPD art. 11).
export default function NoveltyPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    fetchNoveltyStats(days)
      .then(raw => { if (active) setData(buildNovelty(raw)); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [days]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  return (
    <section className="stack" aria-labelledby="novelty-title">
      <div className="page-header">
        <div>
          <h2 className="section-title" id="novelty-title" style={{ margin: 0 }}>Funções novas: quem está usando</h2>
          <p className="section-hint">
            Uso nos últimos {days} dias (séries e corridas); ficha de saúde e planos são do momento. Admins não entram na conta.
          </p>
        </div>
        <div className="actions-row">
          {PERIODS.map(p => (
            <button
              key={p.days} type="button"
              className={days === p.days ? 'btn btn--primary btn--small' : 'btn btn--ghost btn--small'}
              onClick={() => setDays(p.days)}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {!data && <Loading />}

      {data && (
        <div className="dash-groups">
          <div className="card dash-group">
            <h3 className="dash-group__title">Ficha de saúde (PAR-Q)</h3>
            <dl className="dash-group__list">
              <Stat label="Responderam" value={data.parq.answered} note={data.parq.answeredPct == null ? '' : `${data.parq.answeredPct}% de ${data.users}`} />
              <Stat label="Com algum alerta" value={data.parq.withAlert} note={data.parq.alertPct == null ? '' : `${data.parq.alertPct}% de quem respondeu`} />
              <Stat label="Pularam por agora" value={data.parq.skipped} />
              <Stat label="Informaram lesão, restrição ou remédio" value={data.parq.withNotes} />
            </dl>
            <p className="card-note">Só contagens. O conteúdo das respostas fica com o aluno e o personal vinculado.</p>
          </div>

          <div className="card dash-group">
            <h3 className="dash-group__title">RIR e tipo de série</h3>
            <dl className="dash-group__list">
              <Stat label="Séries feitas" value={data.rir.totalSets} note={`${data.rir.activeUsers} pessoa(s)`} />
              <Stat label="Séries com RIR" value={data.rir.sets} note={data.rir.setsPct == null ? '' : `${data.rir.setsPct}% das séries`} />
              <Stat label="Pessoas que usam RIR" value={data.rir.users} note={data.rir.usersPct == null ? '' : `${data.rir.usersPct}% de quem treinou`} />
              <Stat label="Pessoas com série especial" value={data.typedUsers} />
            </dl>
            <Bars rows={data.types} />
          </div>

          <div className="card dash-group">
            <h3 className="dash-group__title">Planos: técnicas e periodização</h3>
            <dl className="dash-group__list">
              <Stat label="Planos ativos" value={data.plans.active} />
              <Stat label="Com técnica de intensidade" value={data.plans.withTechnique} note={data.plans.techniquePct == null ? '' : `${data.plans.techniquePct}%`} />
              <Stat label="Com progressão semanal" value={data.plans.withProgression} note={data.plans.progressionPct == null ? '' : `${data.plans.progressionPct}%`} />
              <Stat label="Com semana leve (deload)" value={data.plans.withDeload} />
            </dl>
          </div>

          <div className="card dash-group">
            <h3 className="dash-group__title">Corrida</h3>
            <dl className="dash-group__list">
              <Stat label="Quem correu" value={data.runs.runners} note={data.runs.runnersPct == null ? '' : `${data.runs.runnersPct}% da base`} />
              <Stat label="Corridas" value={data.runs.runs} />
              <Stat label="Quilômetros" value={String(data.runs.km).replace('.', ',')} />
              <Stat label="Com GPS" value={data.runs.gps} note={data.runs.gpsPct == null ? '' : `${data.runs.gpsPct}%`} />
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
