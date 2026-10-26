import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { fetchRuns, computeRunStats, formatPaceSeconds } from '../lib/runStats';
import { fmtDate } from '../lib/utils';

import { t, locale } from '../lib/i18n';
const km = v => (Math.round(v * 10) / 10).toLocaleString(locale);

// Resumo das corridas registradas (cardio com duração e distância) na aba
// Recordes da Evolução: total, melhor ritmo, maior distância e km por semana.
// Some enquanto não há corrida registrada.
export default function RunStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchRuns(user.id)
      .then(runs => { if (!cancelled) setStats(computeRunStats(runs)); })
      .catch(err => console.error('RunStats:', err));
    return () => { cancelled = true; };
  }, [user]);

  if (!stats || stats.count === 0) return null;
  const maxKm = Math.max(1, ...stats.weeks.map(w => w.km));

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Corridas')}</div>
      <div className="dash-card run-stats">
        <div className="summary-stats">
          <div className="stat-card">
            <span className="stat-card__value">{km(stats.totalKm)}</span>
            <span className="stat-card__label">{t('km no total')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.count}</span>
            <span className="stat-card__label">{t('corridas')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.bestPace === null ? '–' : formatPaceSeconds(stats.bestPace)}</span>
            <span className="stat-card__label">{t('Melhor ritmo (min/km)')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{km(stats.longestKm)}</span>
            <span className="stat-card__label">{t('Maior distância (km)')}</span>
          </div>
        </div>
        <div className="dash-card__subtitle">{t('Quilômetros por semana')}</div>
        <div className="run-stats__weeks" role="img" aria-label={t('Quilômetros por semana')}>
          {stats.weeks.map(w => (
            <div key={w.start} className="run-stats__week">
              <span className="run-stats__week-label">{km(w.km)}</span>
              <span className="run-stats__bar" style={{ height: `${Math.round((w.km / maxKm) * 100)}%` }} />
              <span className="run-stats__week-label">{fmtDate(w.start)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
