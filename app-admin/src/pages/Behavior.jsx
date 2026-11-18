import { useState } from 'react';
import VisitorsSection from '../components/behavior/VisitorsSection';
import EmailsSection from '../components/behavior/EmailsSection';
import UsersSection from '../components/behavior/UsersSection';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Todos' },
];

export default function Behavior() {
  const [days, setDays] = useState(30);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Comportamento</h1>
          <p className="page-subtitle">
            O que visitantes e usuários fazem no app. Os dados começam a contar a partir da publicação desta tela;
            nada aqui guarda IP, modelo de aparelho ou user-agent.
          </p>
        </div>
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

      <VisitorsSection days={days} />
      <EmailsSection days={days} />
      <UsersSection days={days} />
    </div>
  );
}
