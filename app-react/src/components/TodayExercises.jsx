import { setCountOf, allSetsDone } from '../lib/workoutSets';
import { isCardioItem } from '../lib/cardio';
import { t, tEx, tReps } from '../lib/i18n';

// Lista "Exercícios de hoje" da tela de Treino: uma linha por exercício, com o
// nome em até 2 linhas e o resumo (séries × reps · descanso). Tocar abre o modo
// treino do dia. O próximo exercício a fazer fica em destaque, os feitos em verde.
export default function TodayExercises({ day, onOpen, onEdit }) {
  const items = (day?.exercicios || []).filter(ex => setCountOf(ex) > 0 || isCardioItem(ex));
  if (!items.length) return null;
  const doneOf = ex => allSetsDone(ex, setCountOf(ex), day.dia);
  const nextIdx = items.findIndex(ex => !doneOf(ex));

  return (
    <section className="today-list" aria-label={t('Exercícios de hoje')}>
      <div className="today-list__head">
        <h2 className="today-list__title">{t('Exercícios de hoje')}</h2>
        {onEdit && <button type="button" className="today-list__edit" onClick={onEdit}>{t('Editar')}</button>}
      </div>
      {items.map((ex, i) => {
        const done = doneOf(ex);
        const n = setCountOf(ex);
        const meta = isCardioItem(ex)
          ? tReps(ex.reps)
          : `${n} × ${tReps(ex.reps)}${ex.descanso && ex.descanso !== '-' ? ` · ${t('desc.')} ${ex.descanso}` : ''}`;
        return (
          <button
            key={ex.nome}
            type="button"
            className={`today-ex${done ? ' today-ex--done' : ''}${i === nextIdx ? ' today-ex--next' : ''}`}
            onClick={() => onOpen(ex)}
          >
            <span className="today-ex__num" aria-hidden="true">{done ? '✓' : i + 1}</span>
            <span className="today-ex__text">
              <span className="today-ex__name">{tEx(ex.nome)}</span>
              <span className="today-ex__meta">{meta}</span>
            </span>
            <span className="today-ex__chev" aria-hidden="true">›</span>
          </button>
        );
      })}
    </section>
  );
}
