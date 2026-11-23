import { useState } from 'react';
import { fetchExerciseSetsWithDates } from '../lib/records';
import { sessionsFromSets } from '../lib/exerciseHistory';
import { fmtDate } from '../lib/utils';
import LineChart from './LineChart';

import { t, decimal } from '../lib/i18n';
// Últimas sessões de um exercício: maior carga, volume e 1RM estimado, mais a
// curva do 1RM. Abre sob demanda (reaproveita a busca do histórico do bloco).
export default function ExerciseHistory({ userId, nome }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !sessions) {
      fetchExerciseSetsWithDates(userId, nome)
        .then(sets => { setSessions(sessionsFromSets(sets, 6)); setError(false); })
        .catch(err => { console.error('ExerciseHistory:', err); setError(true); });
    }
  }

  const points = (sessions || []).filter(s => s.oneRm !== null).slice().reverse()
    .map(s => ({ label: fmtDate(s.date), value: s.oneRm }));

  return (
    <div className="ex-history">
      <button type="button" className="ex-note__btn" aria-expanded={open} onClick={toggle}>
        {open ? t('📊 Esconder histórico') : t('📊 Histórico')}
      </button>
      {open && (
        <div className="ex-history__panel">
          {error && <p className="dash-empty">{t('⚠️ Não deu para carregar o histórico agora.')}</p>}
          {!error && !sessions && <p className="dash-empty">{t('Carregando…')}</p>}
          {sessions && sessions.length === 0 && <p className="dash-empty">{t('Ainda sem sessões deste exercício.')}</p>}
          {sessions && sessions.length > 0 && (
            <>
              <ul className="ex-history__list">
                {sessions.map(s => (
                  <li key={s.date}>
                    <span className="ex-history__date">{fmtDate(s.date)}</span>
                    <span>{t('{carga} kg × {reps}', { carga: decimal(s.topCarga), reps: s.topReps ?? '–' })}</span>
                    <span className="ex-history__meta">
                      {t('{n} séries · volume {v} kg', { n: s.sets, v: s.volume })}
                      {s.oneRm !== null && <> · {t('1RM ~{v} kg', { v: decimal(s.oneRm) })}</>}
                    </span>
                  </li>
                ))}
              </ul>
              {points.length >= 2 && <LineChart points={points} valueSuffix=" kg" />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
