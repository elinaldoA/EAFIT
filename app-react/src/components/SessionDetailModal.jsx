import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { getModalRoot } from '../lib/modalRoot';
import { fmtDate, formatDuration, parseLocalDate } from '../lib/utils';
import { RATING_OPTIONS } from '../lib/ratingOptions';
import { compareExercise, fetchPreviousBests, fmtVolume } from '../lib/workoutHistory';
import { useBackToClose } from '../hooks/useBackToClose';

function fmtKg(n) {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}kg`;
}

function TrendBadge({ cmp }) {
  if (cmp.trend === 'none') return null;
  if (cmp.trend === 'new') return <span className="trend trend--new">novo</span>;
  const since = `vs ${fmtDate(cmp.previous.date)}`;
  if (cmp.trend === 'same') return <span className="trend trend--same" title={since}>= igual</span>;
  const text = cmp.deltaCarga !== 0
    ? `${cmp.deltaCarga > 0 ? '+' : ''}${fmtKg(cmp.deltaCarga)}`
    : `${cmp.deltaReps > 0 ? '+' : ''}${cmp.deltaReps} rep${Math.abs(cmp.deltaReps) === 1 ? '' : 's'}`;
  return (
    <span className={`trend trend--${cmp.trend}`} title={since}>
      {cmp.trend === 'up' ? '▲' : '▼'} {text}
    </span>
  );
}

export default function SessionDetailModal({ session, onClose }) {
  useBackToClose(onClose);
  const { user } = useAuth();
  const [previous, setPrevious] = useState(null);
  const rating = RATING_OPTIONS.find(o => o.value === session.rating);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const names = session.exercises.filter(e => e.best).map(e => e.nome);
    fetchPreviousBests(user.id, names, session.date)
      .then(map => { if (!cancelled) setPrevious(map); })
      .catch(err => {
        console.error('fetchPreviousBests:', err);
        if (!cancelled) setPrevious(new Map());
      });
    return () => { cancelled = true; };
  }, [user, session]);

  const longDate = parseLocalDate(session.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const title = longDate.charAt(0).toUpperCase() + longDate.slice(1);

  return createPortal(
    <div className="summary-modal" role="dialog" aria-modal="true" aria-labelledby="session-detail-title">
      <div className="summary-modal__backdrop" onClick={onClose} />
      <div className="summary-modal__panel">
        <div className="summary-modal__header">
          <div>
            <h2 className="summary-modal__title" id="session-detail-title">{session.completed ? '✅' : '⏳'} Treino de {session.dayOfWeek}</h2>
            <p className="summary-modal__subtitle">{title}</p>
          </div>
          <button type="button" className="summary-modal__close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>

        <div className="summary-modal__body">
          <div className="summary-stats">
            <div className="stat-card">
              <span className="stat-card__value">{session.durationSeconds ? formatDuration(session.durationSeconds * 1000) : '–'}</span>
              <span className="stat-card__label">Duração</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{session.doneSets}</span>
              <span className="stat-card__label">Séries concluídas</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{session.volume ? fmtVolume(session.volume) : '–'}</span>
              <span className="stat-card__label">Volume (kg × reps)</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__value">{rating ? rating.label : '–'}</span>
              <span className="stat-card__label">Avaliação</span>
            </div>
          </div>

          {session.notes && (
            <div className="summary-section">
              <div className="summary-section__title">Notas</div>
              <p className="session-notes">{session.notes}</p>
            </div>
          )}

          <div className="summary-section">
            <div className="summary-section__title">Exercícios</div>
            {session.exercises.length === 0 ? (
              <p className="session-notes">Nenhuma série registrada nesse treino.</p>
            ) : (
              <div className="summary-table">
                {session.exercises.map(ex => (
                  <div className="summary-table__row" key={ex.nome}>
                    <div className="session-ex__head">
                      <div className="summary-table__name">{ex.nome}</div>
                      {previous === null
                        ? (ex.best && <span className="trend trend--loading" aria-label="Comparando…">…</span>)
                        : <TrendBadge cmp={compareExercise(ex.best, previous.get(ex.nome))} />}
                    </div>
                    <div className="summary-table__sets">
                      {ex.sets.map(s => (
                        <span key={s.n} className={`summary-table__chip${s.done ? ' summary-table__chip--done' : ''}`}>
                          {s.reps ?? '–'}× {s.carga === null ? '–kg' : fmtKg(s.carga)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {previous !== null && session.exercises.some(e => e.best) && (
              <p className="session-hint">▲▼ comparam a melhor série de cada exercício com a última vez que você o fez.</p>
            )}
          </div>
        </div>

        <div className="summary-modal__footer">
          <button type="button" className="btn btn--primary btn--full" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
