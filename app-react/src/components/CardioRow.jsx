import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { formatDuration } from '../lib/utils';
import { formatPace, parsePlannedMinutes, readCardio, toPositive, writeCardioField } from '../lib/cardio';

import { t } from '../lib/i18n';
// Cronômetro guardado em localStorage (sobrevive ao modo ao vivo remontar o
// bloco e a um F5): acumulado + instante em que voltou a correr.
const timerKey = nome => `cardio_timer_${nome}`;

function readTimer(nome) {
  try {
    const t = JSON.parse(localStorage.getItem(timerKey(nome)));
    return { accumulatedMs: t?.accumulatedMs || 0, runningSince: t?.runningSince || null };
  } catch {
    return { accumulatedMs: 0, runningSince: null };
  }
}

function writeTimer(nome, t) {
  localStorage.setItem(timerKey(nome), JSON.stringify(t));
}

const elapsedOf = (t, now) => t.accumulatedMs + (t.runningSince ? now - t.runningSince : 0);

// Registro de um item de cardio (sem séries): cronômetro que preenche a
// duração ao parar, distância opcional, ritmo e check. Salva como a série 1
// do item em exercise_sets.
export default function CardioRow({ ex, day, bump, started }) {
  const { user } = useAuth();
  const { saveSetState } = useWorkout();
  const [vals, setVals] = useState(() => readCardio(ex.nome));
  const [timer, setTimer] = useState(() => readTimer(ex.nome));
  const [now, setNow] = useState(() => Date.now());
  const saveTimers = useRef({});
  const running = !!timer.runningSince;
  const planned = parsePlannedMinutes(ex.reps);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  function persist(patch) {
    if (user) saveSetState(day.dia, ex.nome, 1, patch);
  }

  function setField(field, value) {
    setVals(v => ({ ...v, [field === 'duracao_min' ? 'duracao' : 'distancia']: value }));
    writeCardioField(ex.nome, field === 'duracao_min' ? 'duracao' : 'distancia', value);
    bump();
    clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(() => persist({ [field]: toPositive(value) }), 800);
  }

  function flush(field, value) {
    clearTimeout(saveTimers.current[field]);
    persist({ [field]: toPositive(value) });
  }

  // Fechar a aba antes do debounce disparar perderia o valor digitado.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  function startTimer() {
    const next = { ...timer, runningSince: Date.now() };
    setTimer(next);
    setNow(Date.now());
    writeTimer(ex.nome, next);
  }

  function pauseTimer() {
    const t = Date.now();
    const next = { accumulatedMs: elapsedOf(timer, t), runningSince: null };
    setTimer(next);
    writeTimer(ex.nome, next);
  }

  // Parar passa o tempo para o campo de duração (em minutos, 1 casa) e zera.
  function stopTimer() {
    const ms = elapsedOf(timer, Date.now());
    const next = { accumulatedMs: 0, runningSince: null };
    setTimer(next);
    writeTimer(ex.nome, next);
    if (ms >= 1000) {
      const minutes = String(Math.round((ms / 60000) * 10) / 10);
      setVals(v => ({ ...v, duracao: minutes }));
      writeCardioField(ex.nome, 'duracao', minutes);
      persist({ duracao_min: toPositive(minutes) });
      bump();
    }
  }

  function toggleDone() {
    const next = !vals.done;
    setVals(v => ({ ...v, done: next }));
    writeCardioField(ex.nome, 'done', String(next));
    bump();
    // Ao concluir com cronômetro ainda correndo, fecha ele primeiro.
    if (next && (running || timer.accumulatedMs)) stopTimer();
    persist({ completed: next });
  }

  const pace = formatPace(vals.duracao, vals.distancia);
  const disabled = !started;
  const hint = started ? undefined : t('Inicie o treino para registrar o cardio');
  const elapsed = elapsedOf(timer, now);
  const hasTimer = running || timer.accumulatedMs > 0;

  return (
    <div className="cardio-row">
      <div className="cardio-row__timer">
        <span className={`cardio-row__clock${running ? ' cardio-row__clock--running' : ''}`} aria-label={t('Cronômetro do cardio')}>
          {formatDuration(elapsed)}
        </span>
        {running ? (
          <button type="button" className="btn btn--outline btn--sm" onClick={pauseTimer}>{t('⏸ Pausar')}</button>
        ) : (
          <button type="button" className="btn btn--primary btn--sm" disabled={disabled} title={hint} onClick={startTimer}>
            {hasTimer ? t('▶ Continuar') : t('▶ Iniciar')}
          </button>
        )}
        {hasTimer && <button type="button" className="btn btn--ghost btn--sm" onClick={stopTimer}>{t('⏹ Parar')}</button>}
      </div>

      <div className="cardio-row__fields">
        <label className="cardio-row__field">
          <span>{t('Duração (min)')}</span>
          <input
            className="set-row__carga" type="text" inputMode="decimal" autoComplete="off"
            placeholder={planned ? String(planned) : 'min'} disabled={disabled} title={hint}
            value={vals.duracao}
            onChange={e => setField('duracao_min', e.target.value)}
            onBlur={() => flush('duracao_min', vals.duracao)}
          />
        </label>
        <label className="cardio-row__field">
          <span>{t('Distância (km)')}</span>
          <input
            className="set-row__carga" type="text" inputMode="decimal" autoComplete="off"
            placeholder="km" disabled={disabled} title={hint}
            value={vals.distancia}
            onChange={e => setField('distancia_km', e.target.value)}
            onBlur={() => flush('distancia_km', vals.distancia)}
          />
        </label>
        <button
          type="button"
          className={`set-row__check${vals.done ? ' set-row__check--done' : ''}`}
          aria-pressed={vals.done} aria-label={t('Cardio concluído')}
          disabled={disabled} title={hint} onClick={toggleDone}
        >✓</button>
      </div>

      {pace && <div className="cardio-row__pace">{t('⚡ Ritmo médio:')} <strong>{pace}</strong> min/km</div>}
    </div>
  );
}
