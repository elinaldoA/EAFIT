import { useEffect, useState } from 'react';
import { fetchTopExercises, fetchProfileDistribution, groupDistribution } from '../lib/management';
import Loading from './Loading';

const PERIODS = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const DIMENSIONS = [
  { key: 'meta', title: 'Objetivo' },
  { key: 'nivel', title: 'Nível' },
  { key: 'sexo', title: 'Sexo', labels: { M: 'Masculino', F: 'Feminino' } },
  { key: 'faixa_etaria', title: 'Faixa etária', order: ['14–17', '18–24', '25–34', '35–44', '45–54', '55+', 'não informado'] },
];

// Rótulo legível e, na faixa etária, ordem das idades em vez do total.
function prepare(rows, { labels, order }) {
  if (!rows) return rows;
  const out = rows.map(r => ({ ...r, value: labels?.[r.value] || r.value }));
  return order ? [...out].sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value)) : out;
}

function DistributionBars({ rows }) {
  if (!rows?.length) return <p className="card-note">Sem dados.</p>;
  return (
    <ul className="dist">
      {rows.map(r => (
        <li key={r.value} className="dist__row">
          <span className="dist__label">{r.value}</span>
          <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, r.pct)}%` }} /></span>
          <span className="dist__value">{r.total} · {r.pct}%</span>
        </li>
      ))}
    </ul>
  );
}

export default function AudienceInsights() {
  const [days, setDays] = useState(30);
  const [exercises, setExercises] = useState([]);
  const [dist, setDist] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([fetchTopExercises(days, 10), fetchProfileDistribution()])
      .then(([ex, d]) => { if (active) { setExercises(ex); setDist(groupDistribution(d)); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  const maxSets = Math.max(1, ...exercises.map(e => Number(e.sets_done) || 0));

  return (
    <div className="stack">
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Perfil do público</h2>
        <p className="section-hint">Quem são os usuários cadastrados, segundo o que preencheram no perfil.</p>
      </div>
      <div className="dash-groups">
        {DIMENSIONS.map(d => (
          <div className="card dash-group" key={d.key}>
            <h3 className="dash-group__title">{d.title}</h3>
            <DistributionBars rows={prepare(dist[d.key], d)} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Exercícios mais feitos</h2>
            <p className="section-hint">Os 10 exercícios com mais séries concluídas no período.</p>
          </div>
          <div className="seg" role="group" aria-label="Período dos exercícios">
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
        {!exercises.length ? <p className="card-note">Nenhuma série concluída no período.</p> : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr><th>#</th><th>Exercício</th><th>Séries</th><th>Usuários</th><th>Carga média</th></tr>
              </thead>
              <tbody>
                {exercises.map((e, i) => (
                  <tr key={e.exercise_name}>
                    <td data-label="#" className="rank-cell">{i + 1}</td>
                    <td data-label="Exercício">{e.exercise_name}</td>
                    <td data-label="Séries">
                      <span className="inline-bar">
                        <span className="inline-bar__fill" style={{ width: `${Math.max(3, ((Number(e.sets_done) || 0) / maxSets) * 100)}%` }} />
                        <span>{e.sets_done}</span>
                      </span>
                    </td>
                    <td data-label="Usuários">{e.users_count}</td>
                    <td data-label="Carga média">{e.avg_carga ? `${e.avg_carga} kg` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
