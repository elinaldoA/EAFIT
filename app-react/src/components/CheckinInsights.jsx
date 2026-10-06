import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { addDays } from '../lib/pause';
import { CHECKIN_FIELDS, fetchCheckins, buildCheckinInsights } from '../lib/checkin';

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
      <div className="dash-card__title">🙂 Como você tem se sentido (30 dias)</div>
      {!insights ? (
        <p className="dash-empty">Responda o check-in na aba Treino para ver suas médias de energia, sono e humor.</p>
      ) : (
        <>
          <div className="recap__grid">
            {CHECKIN_FIELDS.map(({ key, label }) => (
              <div className="recap__stat" key={key}>
                <span className="recap__value">{fmt(insights[key])}/5</span>
                <span className="recap__label">{label} · média</span>
              </div>
            ))}
          </div>
          {insights.compare && (
            <p className="recap__delta">
              Energia média: {fmt(insights.compare.energyOn)} nos dias de treino × {fmt(insights.compare.energyOff)} nos outros dias.
            </p>
          )}
          <p className="dash-empty" style={{ marginTop: 8 }}>{insights.days} check-in(s) no período.</p>
        </>
      )}
    </div>
  );
}
