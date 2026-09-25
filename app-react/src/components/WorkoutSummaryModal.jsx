import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { formatDuration } from '../lib/utils';
import { getMuscleGroupsForDay } from '../data/treinoData';
import { shareWorkoutSummary } from '../lib/shareCard';
import { useToast } from '../context/useToast';
import BodyAvatar from './BodyAvatar';
import RatingModal from './RatingModal';
import { RATING_OPTIONS } from '../lib/ratingOptions';

export default function WorkoutSummaryModal({ summary, onClose, onRate }) {
  const { day, durationMs, totalCarga, weekDone, weekTotal, exercises, totalSetsDone, totalPlannedSets } = summary;
  const activeGroups = getMuscleGroupsForDay(day);
  const weekPct = weekTotal ? Math.min(100, (weekDone / weekTotal) * 100) : 0;
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [rating, setRating] = useState(() => {
    const stored = localStorage.getItem(`treino_${day.dia}_rating`);
    return stored ? Number(stored) : null;
  });

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  function handleRate(value) {
    setRating(value);
    localStorage.setItem(`treino_${day.dia}_rating`, value);
    onRate(value);
    setRatingModalOpen(false);
  }

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await shareWorkoutSummary(summary);
      if (result === 'downloaded') toast('🖼️ Imagem baixada');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('shareWorkoutSummary:', err);
        toast('⚠️ Erro ao gerar imagem de compartilhamento');
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      {createPortal(
        <div className="summary-modal" role="dialog" aria-modal="true">
          <div className="summary-modal__backdrop" onClick={onClose} />
          <div className="summary-modal__panel">
            <div className="summary-modal__header">
              <div>
                <h2 className="summary-modal__title">🏁 Resumo do treino</h2>
                <p className="summary-modal__subtitle">{day.dia} · {day.foco}</p>
              </div>
              <button type="button" className="summary-modal__close" aria-label="Fechar" onClick={onClose}>✕</button>
            </div>

            <div className="summary-modal__body">
              <div className="summary-section">
                <div className="summary-section__title">Como foi esse treino?</div>
                <button type="button" className="btn btn--outline btn--full" onClick={() => setRatingModalOpen(true)}>
                  {rating ? `Avaliação: ${RATING_OPTIONS.find(opt => opt.value === rating)?.label}` : 'Avaliar treino'}
                </button>
              </div>

              <div className="summary-stats">
                <div className="stat-card">
                  <span className="stat-card__value">{formatDuration(durationMs)}</span>
                  <span className="stat-card__label">Duração</span>
                </div>
                <div className="stat-card">
                  <span className="stat-card__value">{totalCarga.toLocaleString('pt-BR')}kg</span>
                  <span className="stat-card__label">Carga total</span>
                </div>
                <div className="stat-card">
                  <span className="stat-card__value">{totalSetsDone}/{totalPlannedSets}</span>
                  <span className="stat-card__label">Séries concluídas</span>
                </div>
                <div className="stat-card">
                  <span className="stat-card__value">{exercises.length}</span>
                  <span className="stat-card__label">Exercícios</span>
                </div>
              </div>

              <div className="summary-section">
                <div className="summary-section__title">Meta da semana</div>
                <div className="progress-card">
                  <div className="progress-card__row">
                    <span className="progress-card__label">Treinos concluídos</span>
                    <span className="progress-card__count">{weekDone}/{weekTotal}</span>
                  </div>
                  <div className="progress-card__bar">
                    <div className="progress-card__fill" style={{ width: `${weekPct}%` }} />
                  </div>
                </div>
              </div>

              <div className="summary-section">
                <div className="summary-section__title">Músculos trabalhados</div>
                <BodyAvatar activeGroups={activeGroups} />
              </div>

              {exercises.length > 0 && (
                <div className="summary-section">
                  <div className="summary-section__title">Detalhes das séries</div>
                  <div className="summary-table">
                    {exercises.map(ex => (
                      <div className="summary-table__row" key={ex.nome}>
                        <div className="summary-table__name">{ex.nome}</div>
                        <div className="summary-table__sets">
                          {ex.sets.map(s => (
                            <span key={s.n} className={`summary-table__chip${s.done ? ' summary-table__chip--done' : ''}`}>
                              {s.reps ?? '–'}× {s.carga ?? '–'}kg
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="summary-modal__footer">
              <button type="button" className="btn btn--outline btn--full" disabled={sharing} onClick={handleShare}>
                {sharing ? 'Gerando imagem…' : '📤 Compartilhar treino'}
              </button>
              <button type="button" className="btn btn--primary btn--full" onClick={onClose}>Fechar</button>
            </div>
          </div>
        </div>,
        getModalRoot()
      )}
      {ratingModalOpen && (
        <RatingModal value={rating} onSelect={handleRate} onClose={() => setRatingModalOpen(false)} />
      )}
    </>
  );
}
