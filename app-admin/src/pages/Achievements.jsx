import { useEffect, useState } from 'react';
import { fetchAchievements, fetchRecordStats } from '../lib/insights';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PERIODS = [30, 90, 365];
const kg = v => `${String(v).replace('.', ',')} kg`;

function RecordsCard() {
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setRows(null);
    setError('');
    fetchRecordStats(days)
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [days]);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="section-title" style={{ margin: 0 }}>Cargas por exercício</h2>
        <div className="seg" role="group" aria-label="Período das cargas">
          {PERIODS.map(d => (
            <button
              key={d} type="button" aria-pressed={days === d}
              className={`seg__btn${days === d ? ' seg__btn--active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d === 365 ? '1 ano' : `${d} dias`}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!error && !rows && <Loading />}
      {!error && rows && (rows.length === 0 ? <EmptyState icon="🏋️" label="Nenhuma carga registrada no período." /> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Exercício</th><th>Usuários</th><th>Maior carga</th><th>Média da melhor carga</th><th>Séries</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.exercise}>
                  <td data-label="Exercício">{r.exercise}</td>
                  <td data-label="Usuários">{r.users}</td>
                  <td data-label="Maior carga">{kg(r.top)}</td>
                  <td data-label="Média da melhor carga">{kg(r.avgBest)}</td>
                  <td data-label="Séries">{r.sets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="card-note">
        Os 15 exercícios com mais gente registrando carga. "Média da melhor carga" é a média do recorde de cada
        usuário no período; a maior carga isolada pode ser um erro de digitação.
      </p>
    </div>
  );
}

export default function Achievements() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchAchievements()
      .then(d => { if (active) setData(d); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const never = data ? data.list.filter(a => a.users === 0) : [];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Conquistas e recordes</h1>
          <p className="page-subtitle">
            Quais conquistas os usuários realmente desbloqueiam e em que exercícios eles mais evoluem a carga.
            Contas de admin ficam de fora.
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Conquistas desbloqueadas</h2>
        {error && <p className="form-msg form-msg--error">{error}</p>}
        {!error && !data && <Loading />}
        {data && (
          <>
            <ul className="dist">
              {data.list.map(a => (
                <li key={a.id} className="dist__row" style={{ gridTemplateColumns: '220px 1fr auto' }}>
                  <span className="dist__label" title={a.label}>{a.label}</span>
                  <span className="dist__track"><span className="dist__fill" style={{ width: `${a.users ? Math.max(2, a.pct ?? 0) : 0}%` }} /></span>
                  <span className="dist__value">{a.users}{a.pct !== null && ` · ${a.pct}%`}</span>
                </li>
              ))}
            </ul>
            <p className="card-note">
              Percentual sobre {data.base} usuário(s).
              {never.length > 0 && <> Ninguém desbloqueou ainda: <strong>{never.map(a => a.label).join(', ')}</strong>.</>}
            </p>
          </>
        )}
      </div>

      <RecordsCard />
    </div>
  );
}
