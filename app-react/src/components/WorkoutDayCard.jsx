import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { formatDuration } from '../lib/utils';
import { useWorkoutTimer } from '../hooks/useWorkoutTimer';
import { calcDayVolume, gatherExerciseDetails, countSets } from '../lib/workoutSets';
import { weekProgress } from '../lib/workoutSummary';
import { useFinishWorkout } from '../hooks/useFinishWorkout';
import { useWorkoutNotes } from '../hooks/useWorkoutNotes';
import { useSetActions } from '../hooks/useSetActions';
import SessionTimerBar from './SessionTimerBar';
import { findGroup, nextInGroup, segmentExercises, groupKindLabel } from '../lib/supersets';
import ExerciseBlock from './ExerciseBlock';
import LiveWorkoutModal from './LiveWorkoutModal';
import MobilityButton from './MobilityButton';
import { useAppConfig } from '../context/useAppConfig';
import { isWorkoutHydrationOn } from '../lib/workoutHydration';
import { addWaterMl } from '../lib/waterLog';
import { useWorkoutHydration } from '../hooks/useWorkoutHydration';
import { getModalRoot } from '../lib/modalRoot';
import HydrationAlert from './HydrationAlert';
import { isFlagOn } from '../lib/appConfig';
import { dayMuscles } from '../lib/muscleVolume';

import { weekLabel } from '../lib/periodization';
import { t, locale, tFoco } from '../lib/i18n';

// liveOpen/onOpenLive/onCloseLive: o modo treino ao vivo é controlado pela
// TreinoPage (o card "Treino de hoje" também abre ele), mas renderizado aqui,
// que é quem tem o cronômetro e as ações de série do dia.
export default function DayCard({ day, isToday, bump, onRestStart, onRestAdjust, onFinish, liveOpen, onOpenLive, onCloseLive, liveStart = null }) {
  const { user } = useAuth();
  const { saveWorkoutStatus, saveWorkoutTimer, saveWorkoutNotes, activePlanDays, markPending, periodization } = useWorkout();
  const toast = useToast();
  const { config } = useAppConfig();
  const [open, setOpen] = useState(isToday);
  const [checked, setChecked] = useState(() => localStorage.getItem(`treino_${day.dia}`) === 'true');
  const { markVersions, toggleAllSets, fillOtherSets, applySuggestion, repeatLast } = useSetActions({ day, bump });
  const [notesOpen, setNotesOpen] = useState(false);
  const { notes, handleNotesInput, handleNotesBlur } = useWorkoutNotes({ day, user, saveWorkoutNotes });
  // Muda ao sair do modo ao vivo: remonta os SetRow da lista, que leem o
  // localStorage só na montagem e ficariam com os valores de antes.
  const [liveEpoch, setLiveEpoch] = useState(0);
  const timer = useWorkoutTimer(day.dia);
  // Fim do descanso em andamento (lista ou modo ao vivo), para o lembrete de
  // água preferir esse momento a interromper uma série.
  const restUntil = useRef(0);
  const markRest = seconds => { restUntil.current = Date.now() + seconds * 1000; };
  const drink = useWorkoutHydration({ timer, resting: Date.now() < restUntil.current, enabled: isWorkoutHydrationOn(user) });
  function handleDrink(ml) {
    const total = addWaterMl(user, ml, markPending);
    drink.dismiss();
    toast(t('💧 +{ml} ml · {total} ml hoje', { ml, total }));
  }
  async function markDone(next) {
    setChecked(next);
    localStorage.setItem(`treino_${day.dia}`, next);
    if (user) await saveWorkoutStatus(day.dia, next);
  }

  function handleResetTimer() {
    timer.reset();
    if (user) saveWorkoutTimer(day.dia, { startedAt: null, finishedAt: null, durationSeconds: null });
  }

  function handleStartWorkout() {
    const startedAt = timer.start();
    if (user) saveWorkoutTimer(day.dia, { startedAt, finishedAt: null, durationSeconds: null });
  }

  const { confirmFinish, handleFinishClick, handleFinishWorkout, handleShowSummary } = useFinishWorkout({
    day, user, timer, checked, markDone, bump, onFinish, activePlanDays,
  });

  // Abrir o modo ao vivo já inicia o cronômetro — as séries ficam travadas
  // até o treino começar, e no modo ao vivo não há outro botão pra isso.
  useEffect(() => {
    if (liveOpen && timer.status === 'idle') handleStartWorkout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOpen]);

  function closeLive() {
    onCloseLive();
    setLiveEpoch(e => e + 1);
  }

  function finishFromLive() {
    const alreadyFinished = timer.status === 'finished';
    // Cancelar deixa a pessoa no modo treino, onde estava.
    if (!alreadyFinished && !confirmFinish()) return;
    closeLive();
    if (alreadyFinished) handleShowSummary();
    else handleFinishWorkout();
  }

  async function handleCheckbox(e) {
    e.stopPropagation();
    const next = e.target.checked;
    setChecked(next);
    localStorage.setItem(`treino_${day.dia}`, next);
    bump();
    toast(next ? t('✅ Treino marcado!') : t('Treino desmarcado'));
    if (user) await saveWorkoutStatus(day.dia, next);
  }

  const started = timer.status !== 'idle';

  // Série marcada num bi-set/circuito: segue direto para o próximo da volta, e
  // o descanso só entra ao fechar a volta (lib/supersets.js). No modo ao vivo
  // quem troca de exercício e conta o descanso é o LiveWorkoutModal.
  function handleGroupSetDone(group, ex, n, live) {
    const step = nextInGroup(group, ex.nome, n, (nome, k) => localStorage.getItem(`set_${day.dia}_${nome}_${k}_done`) === 'true');
    if (live) live.onGroupStep(ex, step);
    else if (step.rest && step.seconds > 0) { markRest(step.seconds); onRestStart(ex.nome, step.seconds); }
  }

  function renderExerciseBlock(ex, live = null) {
    const group = findGroup(day.exercicios, ex.nome);
    return (
      <ExerciseBlock
        key={ex.nome} ex={ex} day={day} bump={bump} onRestStart={(label, seconds, ...rest) => { markRest(seconds); (live ? live.onRestStart : onRestStart)(label, seconds, ...rest); }}
        onRestAdjust={live ? live.onRestAdjust : onRestAdjust}
        onSetDone={group ? n => handleGroupSetDone(group, ex, n, live) : undefined}
        // Na lista, não busca sugestões enquanto o modo ao vivo (que tem as
        // próprias instâncias do bloco) estiver aberto por cima.
        open={live ? true : open && !liveOpen} hideName={!!live}
        version={`${markVersions[ex.nome] || 0}-${liveEpoch}`} started={started}
        onToggleAll={() => toggleAllSets(ex, parseInt(ex.series, 10))}
        onFillOthers={(carga, reps) => fillOtherSets(ex, parseInt(ex.series, 10), carga, reps)}
        onApplySuggestion={(carga, reps) => applySuggestion(ex, parseInt(ex.series, 10), carga, reps)}
        onRepeatLast={lastSets => repeatLast(ex, parseInt(ex.series, 10), lastSets)}
      />
    );
  }

  const { done: setsDone, total: setsTotal } = countSets(gatherExerciseDetails(day));

  return (
    <div className={`day-card${isToday ? ' day-card--today' : ''}${checked ? ' day-card--done' : ''}`}>
      <div
        className={`day-card__header${open ? ' open' : ''}`}
        role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
        }}
      >
        <div className="day-card__left">
          <input
            type="checkbox" className="day-card__check"
            aria-label={t('Marcar treino de {dia} como concluído', { dia: t(day.dia) })}
            checked={checked} onChange={handleCheckbox} onClick={e => e.stopPropagation()}
          />
          <div className="day-card__info">
            <div className="day-card__name">{t(day.dia)}</div>
            <div className="day-card__focus">{tFoco(day.foco)}{periodization ? ` · ${weekLabel(periodization)}${periodization.deload ? ' 🌿' : ''}` : ''}</div>
          </div>
        </div>
        <div className="day-card__right">
          {isToday && <span className="today-badge">{t('Hoje')}</span>}
          {(timer.status === 'running' || timer.status === 'paused') && (
            <span className={`timer-badge${timer.status === 'paused' ? ' timer-badge--paused' : ''}`}>
              {timer.status === 'paused' ? '⏸' : '⏱'} {formatDuration(timer.elapsedMs)}
            </span>
          )}
          <span className="day-card__count">
            {setsDone > 0 ? t('{setsDone}/{setsTotal} séries', { setsDone, setsTotal }) : `${day.exercicios.length} exerc.`}
          </span>
          <span className="chevron" aria-hidden="true">▼</span>
        </div>
      </div>
      {setsTotal > 0 && setsDone > 0 && (
        <div className="day-card__progress" aria-hidden="true">
          <div className="day-card__progress-fill" style={{ width: `${(setsDone / setsTotal) * 100}%` }} />
        </div>
      )}

      <div className={`day-card__body${open ? ' open' : ''}`}>
        <SessionTimerBar
          timer={timer} setsTotal={setsTotal} onOpenLive={onOpenLive}
          onStart={handleStartWorkout} onFinish={handleFinishClick}
          onShowSummary={handleShowSummary} onReset={handleResetTimer}
        />

        <div className="day-card__total">
          {t('Volume do treino: {v1} kg', { v1: calcDayVolume(day).toLocaleString(locale) })}
        </div>

        {isFlagOn(config.flags, 'mobilidade') && setsTotal > 0 && (
          <div className="mobility-row">
            {setsDone === 0 && timer.status !== 'finished'
              ? <MobilityButton kind="pre" muscles={dayMuscles(day)} minutes={4} />
              : <MobilityButton kind="pos" muscles={dayMuscles(day)} minutes={5} />}
          </div>
        )}

        <div className="workout-notes">
          <button type="button" className="workout-notes__toggle" onClick={() => setNotesOpen(o => !o)}>
            {t('📝 Notas do treino {v1}', { v1: notesOpen ? '▲' : '▼' })}
          </button>
          {notesOpen && (
            <textarea
              className="workout-notes__textarea"
              aria-label={t('Como foi o treino? Alguma observação pra próxima vez…')} placeholder={t('Como foi o treino? Alguma observação pra próxima vez…')}
              value={notes} onChange={handleNotesInput} onBlur={handleNotesBlur}
            />
          )}
        </div>

        {segmentExercises(day.exercicios).map(seg => (seg.type === 'single' ? renderExerciseBlock(seg.ex) : (
          <div className="superset" key={`grupo-${seg.members[0].nome}`}>
            <div className="superset__head">
              <span className="superset__badge">🔗 {groupKindLabel(seg.members.length)} {seg.letter}</span>
              <span className="superset__hint">{t('Uma série de cada, em sequência · descanso no fim da volta')}</span>
            </div>
            {seg.members.map(m => renderExerciseBlock(m))}
          </div>
        )))}

        {day.pos.length > 0 && (
          <div className="post-section">
            <div className="post-title">{t('🏁 Pós-treino — Cardio + Abdômen')}</div>
            {day.pos.map(p => renderExerciseBlock(p))}
          </div>
        )}
      </div>

      {/* Fora do modo ao vivo o lembrete flutua por cima da lista (e do timer de descanso). */}
      {drink.alert && !liveOpen && createPortal(
        <HydrationAlert className="live__drink drink-float" onDrink={handleDrink} onDismiss={drink.dismiss} />,
        getModalRoot()
      )}

      {liveOpen && (
        <LiveWorkoutModal
          day={day}
          startIndex={liveStart}
          timer={timer}
          week={weekProgress(activePlanDays)}
          renderExercise={(ex, onLiveRest, onGroupStep, onLiveAdjust) => renderExerciseBlock(ex, {
            onRestStart: onLiveRest,
            onRestAdjust: onLiveAdjust,
            onGroupStep: (doneEx, step) => { if (step.rest && step.seconds > 0) markRest(step.seconds); onGroupStep(doneEx, step); },
          })}
          onFinish={finishFromLive}
          onClose={closeLive}
          drinkAlert={drink.alert}
          onDrink={handleDrink}
          onDismissDrink={drink.dismiss}
        />
      )}
    </div>
  );
}
