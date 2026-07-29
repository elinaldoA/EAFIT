import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import { parseRestSeconds, formatDuration } from '../lib/utils';
import { playWorkoutFinishedSound } from '../lib/sound';
import { checkForNewPR, fetchProgressionSuggestion, fetchPlateauStatus } from '../lib/records';
import { fetchRecentDiscomfort } from '../lib/discomfort';
import { substituteExercise } from '../lib/workoutPlans';
import { getSaferAlternative } from '../data/workoutTemplates';
import { isNotifyEnabled } from '../lib/notifications';
import { sendPushToSelf } from '../lib/pushSubscriptions';
import { useWorkoutTimer } from '../hooks/useWorkoutTimer';
import { calcDayTotalCarga, gatherExerciseDetails, countSets, allSetsDone } from '../lib/workoutSets';
import { DiscomfortPanel } from './DiscomfortWidgets';

function SetRow({ ex, n, day, bump, onRestStart, onFillOthers, started }) {
  const { user } = useAuth();
  const { saveSetState, workoutIds } = useWorkout();
  const toast = useToast();
  const [carga, setCarga] = useState(() => localStorage.getItem(`set_${ex.nome}_${n}_carga`) || '');
  const [reps, setReps] = useState(() => localStorage.getItem(`set_${ex.nome}_${n}_reps`) || '');
  const [done, setDone] = useState(() => localStorage.getItem(`set_${ex.nome}_${n}_done`) === 'true');
  const [saved, setSaved] = useState(false);
  const cargaSaveTimer = useRef(null);
  const repsSaveTimer = useRef(null);

  async function flushCarga(val, showFlash) {
    if (!user) return;
    await saveSetState(day.dia, ex.nome, n, { carga: val === '' ? null : parseFloat(val) });
    if (showFlash) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }
  }

  async function flushReps(val, showFlash) {
    if (!user) return;
    await saveSetState(day.dia, ex.nome, n, { reps: val === '' ? null : parseFloat(val) });
    if (showFlash) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }
  }

  function handleCargaInput(e) {
    const val = e.target.value;
    setCarga(val);
    localStorage.setItem(`set_${ex.nome}_${n}_carga`, val);
    bump();
    clearTimeout(cargaSaveTimer.current);
    // Salva em background a cada pausa de digitação, mas sem piscar — o flash
    // visual só acontece quando o usuário termina o campo (blur), pra não
    // piscar várias vezes numa digitação com pausas.
    cargaSaveTimer.current = setTimeout(() => flushCarga(val, false), 800);
  }

  function handleRepsInput(e) {
    const val = e.target.value;
    setReps(val);
    localStorage.setItem(`set_${ex.nome}_${n}_reps`, val);
    bump();
    clearTimeout(repsSaveTimer.current);
    repsSaveTimer.current = setTimeout(() => flushReps(val, false), 800);
  }

  // Assim que carga e reps da Série 1 estão preenchidos, propaga pras demais
  // séries do exercício que ainda estiverem vazias — poupa redigitar o mesmo
  // peso/reps em cada série. Só dispara pra n===1 (a primeira que o usuário
  // preenche no fluxo normal) e só nas que estão vazias, pra não sobrescrever
  // uma série que o usuário já tenha ajustado de propósito (drop-set, pirâmide).
  function maybeFillOthers(nextCarga, nextReps) {
    if (n !== 1 || !onFillOthers || nextCarga === '' || nextReps === '') return;
    onFillOthers(nextCarga, nextReps);
  }

  // Ao sair do campo (blur), salva na hora — sem isso, um F5 rápido logo após
  // digitar pode acontecer antes do debounce de 800ms disparar, perdendo o valor.
  function handleCargaBlur() {
    clearTimeout(cargaSaveTimer.current);
    flushCarga(carga, true);
    maybeFillOthers(carga, reps);
  }

  function handleRepsBlur() {
    clearTimeout(repsSaveTimer.current);
    flushReps(reps, true);
    maybeFillOthers(carga, reps);
  }

  // Reload/fechar de aba destrói os setTimeout pendentes antes deles rodarem —
  // dispara os saves na hora (o fetch com keepalive do client sobrevive ao unload).
  useEffect(() => {
    function flushPending() {
      if (cargaSaveTimer.current) {
        clearTimeout(cargaSaveTimer.current);
        flushCarga(carga, false);
      }
      if (repsSaveTimer.current) {
        clearTimeout(repsSaveTimer.current);
        flushReps(reps, false);
      }
    }
    window.addEventListener('pagehide', flushPending);
    window.addEventListener('beforeunload', flushPending);
    return () => {
      window.removeEventListener('pagehide', flushPending);
      window.removeEventListener('beforeunload', flushPending);
    };
  });

  async function handleCheck() {
    const next = !done;
    setDone(next);
    localStorage.setItem(`set_${ex.nome}_${n}_done`, next);
    bump();
    if (next) {
      const restSeconds = parseRestSeconds(ex.descanso);
      if (restSeconds > 0) onRestStart(ex.nome, restSeconds);
    }
    if (user) {
      const wId = await saveSetState(day.dia, ex.nome, n, { completed: next });
      if (next) {
        const cargaNum = parseFloat(carga);
        if (Number.isFinite(cargaNum)) {
          try {
            const pr = await checkForNewPR(user.id, ex.nome, cargaNum, reps, {
              workoutId: wId ?? workoutIds[day.dia], setNumber: n,
            });
            if (pr) {
              toast(`🏆 Novo recorde em ${ex.nome}!`);
              if (isNotifyEnabled(user.user_metadata, 'notifyRecords')) {
                sendPushToSelf({
                  title: '🏆 Novo recorde!',
                  body: `${ex.nome}: ${cargaNum}kg`,
                  tag: `pr-${ex.nome}`,
                }).catch(err => console.error('sendPushToSelf:', err));
              }
            }
          } catch (err) {
            console.error('checkForNewPR:', err);
          }
        }
      }
    }
  }

  return (
    <div className="set-row-wrap">
      <div className="set-row">
        <span className="set-row__label">Série {n}</span>
        <input
          className={`set-row__carga${saved ? ' saved' : ''}`}
          type="text" inputMode="decimal" placeholder="kg" autoComplete="off"
          value={carga} onChange={handleCargaInput} onBlur={handleCargaBlur}
          disabled={!started} title={started ? undefined : 'Inicie o treino para registrar as séries'}
        />
        <input
          className={`set-row__carga${saved ? ' saved' : ''}`}
          type="text" inputMode="numeric" placeholder="reps" autoComplete="off"
          value={reps} onChange={handleRepsInput} onBlur={handleRepsBlur}
          disabled={!started} title={started ? undefined : 'Inicie o treino para registrar as séries'}
        />
        <button
          type="button"
          className={`set-row__check${done ? ' set-row__check--done' : ''}`}
          aria-pressed={done}
          onClick={handleCheck}
          disabled={!started} title={started ? undefined : 'Inicie o treino para registrar as séries'}
        >✓</button>
      </div>
    </div>
  );
}

function ExerciseBlock({ ex, day, bump, onRestStart, open, version, onToggleAll, onFillOthers, onApplySuggestion, started }) {
  const { user } = useAuth();
  const { refreshPlan } = useWorkout();
  const toast = useToast();
  const [suggestion, setSuggestion] = useState(null);
  const [plateau, setPlateau] = useState(null);
  const [discomfort, setDiscomfort] = useState(null);
  const [substituting, setSubstituting] = useState(false);
  const setCount = parseInt(ex.series, 10);

  useEffect(() => {
    if (!user || !open || !setCount) return;
    let cancelled = false;
    fetchProgressionSuggestion(user.id, ex.nome, ex.reps)
      .then(s => { if (!cancelled) setSuggestion(s); })
      .catch(err => console.error('fetchProgressionSuggestion:', err));
    fetchPlateauStatus(user.id, ex.nome, ex.reps)
      .then(p => { if (!cancelled) setPlateau(p); })
      .catch(err => console.error('fetchPlateauStatus:', err));
    // Duplica a mesma consulta que o DiscomfortPanel já faz internamente —
    // aqui só precisamos saber se dá pra mostrar o botão de troca de exercício,
    // sem acoplar os dois componentes.
    fetchRecentDiscomfort(user.id, ex.nome)
      .then(d => { if (!cancelled) setDiscomfort(d); })
      .catch(err => console.error('fetchRecentDiscomfort:', err));
    return () => { cancelled = true; };
  }, [user, open, setCount, ex.nome, ex.reps]);

  if (!setCount) {
    return (
      <div className="ex-block">
        <div className="ex-block__header">
          <span className="ex-name">{ex.nome}</span>
          <span className="ex-block__meta">{ex.reps}</span>
        </div>
      </div>
    );
  }

  const alternative = getSaferAlternative(ex.nome);
  const showSwap = discomfort && ['forte', 'lesao'].includes(discomfort.severity) && alternative;

  async function handleSubstitute() {
    if (!ex.id || !alternative || substituting) return;
    setSubstituting(true);
    try {
      await substituteExercise(ex.id, {
        nome: alternative.nome, series: ex.series, reps: ex.reps,
        descanso: ex.descanso, tecnica: alternative.tecnica,
      });
      toast(`🔄 Trocado por ${alternative.nome}`);
      await refreshPlan();
    } catch (err) {
      console.error('substituteExercise:', err);
      toast('⚠️ Erro ao trocar o exercício');
    } finally {
      setSubstituting(false);
    }
  }

  const allDone = allSetsDone(ex, setCount);
  return (
    <div className="ex-block">
      <div className="ex-block__header">
        <div className="ex-block__titles">
          <span className="ex-name">{ex.nome}</span>
          <span className="ex-block__meta">{ex.reps} reps · desc. {ex.descanso}</span>
          {plateau ? (
            plateau.underEffort ? (
              <p className="ex-block__suggestion ex-block__suggestion--under-effort">
                💪 Carga travada, mas RIR médio de {plateau.avgRir.toFixed(1)} — você ainda tem folga
                {' '}<span className="ex-block__suggestion-hint">— tente subir a carga na próxima sessão</span>
              </p>
            ) : (
              <p className="ex-block__suggestion ex-block__suggestion--plateau">
                ⚠️ Estagnado há {plateau.sessionsStuck} treinos em {plateau.lastCarga}kg
                {' '}<span className="ex-block__suggestion-hint">— tente um deload pra {plateau.suggestedDeload}kg ou troque o exercício</span>
                {' '}<button type="button" className="ex-block__apply-btn" disabled={!started} onClick={() => onApplySuggestion(plateau.suggestedDeload, null)}>🎯 Usar sugestão</button>
              </p>
            )
          ) : suggestion && (
            <p className="ex-block__suggestion">
              {suggestion.suggestedReps
                ? <>💡 Sugestão: repita {suggestion.suggestedCarga}kg, mas tente {suggestion.suggestedReps} reps</>
                : <>💡 Sugestão: {suggestion.suggestedCarga}kg</>}
              {' '}<span className="ex-block__suggestion-hint">(última vez: {suggestion.lastCarga}kg × {suggestion.lastReps} reps)</span>
              {' '}<button type="button" className="ex-block__apply-btn" disabled={!started} onClick={() => onApplySuggestion(suggestion.suggestedCarga, suggestion.suggestedReps)}>🎯 Usar sugestão</button>
            </p>
          )}
        </div>
        <button
          type="button"
          className={`ex-block__mark-all${allDone ? ' ex-block__mark-all--done' : ''}`}
          disabled={!started} title={started ? undefined : 'Inicie o treino para registrar as séries'}
          onClick={onToggleAll}
        >
          {allDone ? '✓ Todas' : 'Marcar todas'}
        </button>
      </div>

      <div className="ex-block__sets">
        {Array.from({ length: setCount }, (_, i) => i + 1).map(n => (
          <SetRow key={`${n}-${version}`} ex={ex} n={n} day={day} bump={bump} onRestStart={onRestStart} onFillOthers={onFillOthers} started={started} />
        ))}
      </div>

      {user && <DiscomfortPanel userId={user.id} exerciseName={ex.nome} toast={toast} />}
      {showSwap && (
        <button type="button" className="ex-block__swap-btn" disabled={substituting} onClick={handleSubstitute}>
          {substituting ? 'Trocando…' : `🔄 Trocar por: ${alternative.nome}`}
        </button>
      )}
    </div>
  );
}

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
