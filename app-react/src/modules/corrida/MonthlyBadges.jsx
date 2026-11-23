import { monthlyBadges } from './runMonthly';
import { t, locale } from '../../lib/i18n';

const monthName = key => {
  const [y, m] = key.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return name.charAt(0).toUpperCase() + name.slice(1);
};

// Selos do mês (renovam todo dia 1) e a estante dos meses anteriores.
export default function MonthlyBadges({ runs, today }) {
  const { current, shelf } = monthlyBadges(runs, today);
  const done = current.filter(b => b.unlocked).length;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Selos do mês')} · {done}/{current.length}</div>
      <ul className="run-badges">
        {current.map(b => (
          <li key={b.id} className={`run-badge${b.unlocked ? ' run-badge--on' : ''}`}>
            <span className="run-badge__icon" aria-hidden="true">{b.icon}</span>
            <span className="run-badge__title">{b.title}</span>
            <span className="run-badge__state">{b.unlocked ? t('Conquistado') : `${Math.floor(b.progress * 100)}%`}</span>
            {!b.unlocked && <span className="run-badge__bar" aria-hidden="true"><span style={{ width: `${Math.floor(b.progress * 100)}%` }} /></span>}
          </li>
        ))}
      </ul>
      {shelf.length > 0 && (
        <div className="dash-card run-goals">
          <strong>{t('Estante de selos')}</strong>
          {shelf.map(m => (
            <p key={m.month} className="profile-field__hint">
              {monthName(m.month)}: {m.badges.map(b => `${b.icon} ${b.title}`).join(' · ')}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
