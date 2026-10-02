import { useEffect, useState } from 'react';
import { fetchFunnel } from '../lib/dashboardStats';
import { buildFunnel } from '../lib/activation';
import Loading from './Loading';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Todos' },
];

export default function ActivationFunnel() {
  const [days, setDays] = useState(30);
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchFunnel(days)
      .then(r => { if (active) setRow(r); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const { steps, worstKey } = buildFunnel(row);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="section-title" style={{ margin: 0 }}>Funil de ativação</h2>
        <div className="seg" role="group" aria-label="Cadastrados no período">
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

      {loading ? <Loading /> : error ? <p className="form-msg form-msg--error">{error}</p> : (
        <ol className="funnel">
          {steps.map((s, i) => (
            <li key={s.key} className={`funnel__step${s.key === worstKey ? ' funnel__step--worst' : ''}`}>
              <div className="funnel__label">
                <span>{s.label}</span>
                <strong>{s.count}</strong>
              </div>
              <div className="funnel__track">
                <div className="funnel__bar" style={{ width: `${Math.max(s.count ? 2 : 0, s.pctOfStart ?? 0)}%` }} />
              </div>
              <div className="funnel__meta">
                {i === 0 ? 'base' : s.pctOfPrev == null ? '—' : `${s.pctOfPrev}% da etapa anterior`}
                {s.key === worstKey && <span className="badge badge--danger">maior perda</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="card-note">
        Usuários cadastrados no período (sem admins). Treino = concluído, finalizado ou com ao menos uma série
        marcada — abrir o app não conta. Cadastros recentes ainda podem avançar no funil.
      </p>
    </div>
  );
}
