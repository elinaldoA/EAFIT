import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { addDays } from '../lib/pause';
import { CHECKIN_FIELDS, fetchCheckins, buildCheckinInsights } from '../lib/checkin';

import { t } from '../lib/i18n';
const fmt = n => String(n).replace('.', ',');

// Médias dos check-ins dos últimos 30 dias e como a energia muda nos dias de treino.
export default function CheckinInsights({ userId, trainedDates }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let active = true;
    fetchCheckins(userId, addDays(todayDate(), -30))
      .then(r => { if (active) setRows(r); })
      .catch(err => { console.error('fetchCheckins:', err); if (active) setRows([]); });
    return () => { active = false; };
  }, [userId]);

  const insights = useMemo(() => (rows ? buildCheckinInsights(rows, trainedDates) : null), [rows, trainedDates]);

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('🙂 Como você tem se sentido (30 dias)')}</div>
      {!insights ? (
        <p className="dash-empty">{t('Responda o check-in na aba Treino para ver suas médias de energia, sono e humor.')}</p>
      ) : (
        <>
          <div className="recap__grid">
            {CHECKIN_FIELDS.map(({ key, label }) => (
              <div className="recap__stat" key={key}>
                <span className="recap__value">{fmt(insights[key])}/5</span>
                <span className="recap__label">{t('{label} · média', { label })}</span>
              </div>
            ))}
          </div>
          {insights.compare && (
            <p className="recap__delta">
              {t('Energia média: {v1} nos dias de treino × {v2} nos outros dias.', { v1: fmt(insights.compare.energyOn), v2: fmt(insights.compare.energyOff) })}
            </p>
          )}
          <p className="dash-empty" style={{ marginTop: 8 }}>{t('{days} check-in(s) no período.', { days: insights.days })}</p>
        </>
      )}
    </div>
  );
}
