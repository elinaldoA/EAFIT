import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { formatDuration } from '../lib/utils';
import { playWorkoutFinishedSound } from '../lib/sound';
import { useWorkoutTimer } from '../hooks/useWorkoutTimer';
import { calcDayTotalCarga, gatherExerciseDetails, countSets, allSetsDone } from '../lib/workoutSets';
import ExerciseBlock from './ExerciseBlock';

export default function DayCard({ day, isToday, bump, onRestStart, onFinish }) {
  const { user } = useAuth();
  const { saveWorkoutStatus, saveSetState, saveWorkoutTimer, saveWorkoutNotes, activePlanDays } = useWorkout();
  const toast = useToast();
  const [open, setOpen] = useState(isToday);
  const [checked, setChecked] = useState(() => localStorage.getItem(`treino_${day.dia}`) === 'true');
  const [markVersions, setMarkVersions] = useState({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(() => localStorage.getItem(`treino_${day.dia}_notes`) || '');
  const notesSaveTimer = useRef(null);
  const timer = useWorkoutTimer(day.dia);

  async function markDone(next) {
    setChecked(next);
    localStorage.setItem(`treino_${day.dia}`, next);
    if (user) await saveWorkoutStatus(day.dia, next);
  }

  async function flushNotes(val) {
    if (!user) return;
    try {
      await saveWorkoutNotes(day.dia, val);
    } catch (err) {
      console.error('saveWorkoutNotes:', err);
    }
  }

  function handleNotesInput(e) {
    const val = e.target.value;
    setNotes(val);
    localStorage.setItem(`treino_${day.dia}_notes`, val);
    clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => flushNotes(val), 800);
  }

  function handleNotesBlur() {
    clearTimeout(notesSaveTimer.current);
    flushNotes(notes);
  }

  // Mesma proteção contra F5/fechar aba que SetRow já usa: dispara o save
  // pendente na hora em vez de esperar o debounce de 800ms.
  useEffect(() => {
    function flushPendingNotes() {
      if (notesSaveTimer.current) {
        clearTimeout(notesSaveTimer.current);
        flushNotes(notes);
      }
    }
    window.addEventListener('pagehide', flushPendingNotes);
    window.addEventListener('beforeunload', flushPendingNotes);
    return () => {
      window.removeEventListener('pagehide', flushPendingNotes);
      window.removeEventListener('beforeunload', flushPendingNotes);
    };
  });

  function handleResetTimer() {
    timer.reset();
    if (user) saveWorkoutTimer(day.dia, { startedAt: null, finishedAt: null, durationSeconds: null });
  }

  function handleStartWorkout() {
    const startedAt = timer.start();
    if (user) saveWorkoutTimer(day.dia, { startedAt, finishedAt: null, durationSeconds: null });
  }

  function buildSummary(durationMs) {
    const exercises = gatherExerciseDetails(day);
    const { done: totalSetsDone, total: totalPlannedSets } = countSets(exercises);
    const workDays = activePlanDays.filter(d => d.dia !== 'Sábado' && d.dia !== 'Domingo');
    const weekDone = workDays.filter(d => localStorage.getItem(`treino_${d.dia}`) === 'true').length;
    return {
      day, durationMs, totalCarga: calcDayTotalCarga(day),
      exercises, totalSetsDone, totalPlannedSets, weekDone, weekTotal: workDays.length,
    };
  }

  function handleFinishWorkout() {
    const result = timer.finish();
    if (!result) return;
    const { accumulatedMs, startedAt, finishedAt } = result;
    playWorkoutFinishedSound();
    toast(`🏁 Treino finalizado em ${formatDuration(accumulatedMs)}!`);
    if (!checked) markDone(true);
    if (user) saveWorkoutTimer(day.dia, { startedAt, finishedAt, durationSeconds: Math.round(accumulatedMs / 1000) });
    bump();
    onFinish(buildSummary(accumulatedMs));
  }

  function handleShowSummary() {
    onFinish(buildSummary(timer.elapsedMs));
  }

  async function toggleAllSets(ex, setCount) {
    const next = !allSetsDone(ex, setCount);
    for (let n = 1; n <= setCount; n++) {
      localStorage.setItem(`set_${ex.nome}_${n}_done`, next);
    }
    setMarkVersions(v => ({ ...v, [ex.nome]: (v[ex.nome] || 0) + 1 }));
    bump();
    toast(next ? '✅ Todas as séries marcadas!' : 'Séries desmarcadas');
    if (user) {
      await Promise.all(
        Array.from({ length: setCount }, (_, i) => i + 1)
          .map(n => saveSetState(day.dia, ex.nome, n, { completed: next }))
      );
    }
  }

  async function fillOtherSets(ex, setCount, carga, reps) {
    const cargaNum = parseFloat(carga);
    if (!Number.isFinite(cargaNum) || reps === '') return;

    const toFill = [];
    for (let n = 2; n <= setCount; n++) {
      const existingCarga = localStorage.getItem(`set_${ex.nome}_${n}_carga`);
      const existingReps = localStorage.getItem(`set_${ex.nome}_${n}_reps`);
      if (!existingCarga && !existingReps) toFill.push(n);
    }
    if (!toFill.length) return;

    toFill.forEach(n => {
      localStorage.setItem(`set_${ex.nome}_${n}_carga`, carga);
      localStorage.setItem(`set_${ex.nome}_${n}_reps`, reps);
    });
    setMarkVersions(v => ({ ...v, [ex.nome]: (v[ex.nome] || 0) + 1 }));
    bump();
    toast('✅ Carga e reps repetidas nas outras séries');
    if (user) {
      await Promise.all(
        toFill.map(n => saveSetState(day.dia, ex.nome, n, { carga: cargaNum, reps: parseFloat(reps) }))
      );
    }
  }

  // Aplica a sugestão de progressão/deload direto na Série 1 (mesmo truque de
  // localStorage + bump de markVersions que fillOtherSets já usa pra forçar o
  // SetRow a reler o valor) e reaproveita fillOtherSets pra propagar às demais
  // séries vazias quando há um alvo de reps (não há no caso de deload).
  async function applySuggestion(ex, setCount, carga, reps) {
    localStorage.setItem(`set_${ex.nome}_1_carga`, carga);
    if (reps != null) localStorage.setItem(`set_${ex.nome}_1_reps`, reps);
    setMarkVersions(v => ({ ...v, [ex.nome]: (v[ex.nome] || 0) + 1 }));
    bump();
    toast('🎯 Sugestão aplicada na Série 1');
    if (user) {
      const patch = { carga: parseFloat(carga) };
      if (reps != null) patch.reps = parseFloat(reps);
      try {
        await saveSetState(day.dia, ex.nome, 1, patch);
      } catch (err) {
        console.error('applySuggestion:', err);
      }
    }
    if (reps != null) await fillOtherSets(ex, setCount, carga, reps);
  }

  async function handleCheckbox(e) {
    e.stopPropagation();
    const next = e.target.checked;
    setChecked(next);
    localStorage.setItem(`treino_${day.dia}`, next);
    bump();
    toast(next ? '✅ Treino marcado!' : 'Treino desmarcado');
    if (user) await saveWorkoutStatus(day.dia, next);
  }

  const started = timer.status !== 'idle';

  function renderExerciseBlock(ex) {
    return (
      <ExerciseBlock
        key={ex.nome} ex={ex} day={day} bump={bump} onRestStart={onRestStart}
        open={open} version={markVersions[ex.nome] || 0} started={started}
        onToggleAll={() => toggleAllSets(ex, parseInt(ex.series, 10))}
        onFillOthers={(carga, reps) => fillOtherSets(ex, parseInt(ex.series, 10), carga, reps)}
        onApplySuggestion={(carga, reps) => applySuggestion(ex, parseInt(ex.series, 10), carga, reps)}
      />
    );
  }

  return (
    <div className={`day-card${isToday ? ' day-card--today' : ''}`}>
      <div className={`day-card__header${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <div className="day-card__left">
          <input
            type="checkbox" className="day-card__check"
            checked={checked} onChange={handleCheckbox} onClick={e => e.stopPropagation()}
          />
          <span className="day-card__indicator">{checked ? '✅' : '⬜'}</span>
          <div className="day-card__info">
            <div className="day-card__name">{day.dia}</div>
            <div className="day-card__focus">{day.foco}</div>
          </div>
        </div>
        <div className="day-card__right">
          {isToday && <span className="today-badge">Hoje</span>}
          {(timer.status === 'running' || timer.status === 'paused') && (
            <span className={`timer-badge${timer.status === 'paused' ? ' timer-badge--paused' : ''}`}>
              {timer.status === 'paused' ? '⏸' : '⏱'} {formatDuration(timer.elapsedMs)}
            </span>
          )}
          <span className="day-card__count">{day.exercicios.length} exerc.</span>
          <span className="chevron">▼</span>
        </div>
      </div>

      <div className={`day-card__body${open ? ' open' : ''}`}>
        <div className="session-timer">
          <div className="session-timer__clock">
            {formatDuration(timer.elapsedMs)}
            {timer.status === 'finished' && <span className="session-timer__done"> · concluído</span>}
          </div>
          <div className="session-timer__actions">
            {timer.status === 'idle' && (
              <>
                <span className="session-timer__hint">Inicie o treino para registrar as séries</span>
                <button type="button" className="btn btn--primary btn--sm" onClick={handleStartWorkout}>▶ Iniciar treino</button>
              </>
            )}
            {timer.status === 'running' && (
              <>
                <button type="button" className="btn btn--outline btn--sm" onClick={timer.pause}>⏸ Pausar</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={handleFinishWorkout}>🏁 Finalizar</button>
              </>
            )}
            {timer.status === 'paused' && (
              <>
                <button type="button" className="btn btn--outline btn--sm" onClick={timer.resume}>▶ Continuar</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={handleFinishWorkout}>🏁 Finalizar</button>
              </>
            )}
            {timer.status === 'finished' && (
              <>
                <button type="button" className="btn btn--outline btn--sm" onClick={handleShowSummary}>📋 Ver resumo</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={handleResetTimer}>↺ Refazer treino</button>
              </>
            )}
          </div>
        </div>

        <div className="day-card__total">
          Carga total do treino: {calcDayTotalCarga(day).toLocaleString('pt-BR')} kg
        </div>

        <div className="workout-notes">
          <button type="button" className="workout-notes__toggle" onClick={() => setNotesOpen(o => !o)}>
            📝 Notas do treino {notesOpen ? '▲' : '▼'}
          </button>
          {notesOpen && (
            <textarea
              className="workout-notes__textarea"
              placeholder="Como foi o treino? Alguma observação pra próxima vez…"
              value={notes} onChange={handleNotesInput} onBlur={handleNotesBlur}
            />
          )}
        </div>

        {day.exercicios.map(ex => renderExerciseBlock(ex))}

        {day.pos.length > 0 && (
          <div className="post-section">
            <div className="post-title">🏁 Pós-treino — Cardio + Abdômen</div>
            {day.pos.map(p => renderExerciseBlock(p))}
          </div>
        )}
      </div>
    </div>
  );
}
