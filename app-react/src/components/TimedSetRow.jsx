import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { announceBodyweightPR } from '../lib/bodyweightPR';
import { parseRestSeconds } from '../lib/utils';
import { parsePlannedSeconds, toSeconds, formatSeconds } from '../lib/timedSets';
import { playRestDoneSound } from '../lib/sound';

import { t } from '../lib/i18n';
// Série medida em segundos (prancha, hollow hold, L-sit...): campo de duração
// no lugar de "reps", kg opcional (isometria com peso) e um cronômetro que
// preenche a duração ao parar e avisa quando a meta do plano é atingida.
// Salva em exercise_sets.duracao_s (reps fica nulo, então não entra em volume
// nem em recordes). `onSetDone` é só dos bi-sets/circuitos, como em SetRow.
export default function TimedSetRow({ ex, n, day, bump, onRestStart, onSetDone, started }) {
  const { user } = useAuth();
  const { saveSetState, workoutIds } = useWorkout();
  const toast = useToast();
  const key = field => `set_${ex.nome}_${n}_${field}`;
  const [carga, setCarga] = useState(() => localStorage.getItem(key('carga')) || '');
  const [duracao, setDuracao] = useState(() => localStorage.getItem(key('duracao_s')) || '');
  const [done, setDone] = useState(() => localStorage.getItem(key('done')) === 'true');
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const saveTimer = useRef({});
  const beeped = useRef(false);
  const planned = parsePlannedSeconds(ex.reps);
  const running = startedAt !== null;
  const elapsed = running ? Math.floor((now - startedAt) / 1000) : 0;
  const disabledTitle = started ? undefined : t('Inicie o treino para registrar as séries');

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && planned && elapsed >= planned && !beeped.current) {
      beeped.current = true;
      playRestDoneSound();
    }
  }, [running, planned, elapsed]);

  useEffect(() => () => Object.values(saveTimer.current).forEach(clearTimeout), []);

  function persist(patch) {
    if (user) saveSetState(day.dia, ex.nome, n, patch);
  }

  function patchFor(field, value) {
    return field === 'carga'
      ? { carga: value === '' ? null : parseFloat(value.replace(',', '.')) }
      : { duracao_s: toSeconds(value) };
  }

  function change(field, value, setter) {
    setter(value);
    localStorage.setItem(key(field), value);
    bump();
    clearTimeout(saveTimer.current[field]);
    saveTimer.current[field] = setTimeout(() => persist(patchFor(field, value)), 800);
  }

  function flush(field, value) {
    clearTimeout(saveTimer.current[field]);
    persist(patchFor(field, value));
  }

  function toggleTimer() {
    if (!running) {
      beeped.current = false;
      const t0 = Date.now();
      setNow(t0);
      setStartedAt(t0);
      return;
    }
    const secs = String(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    setStartedAt(null);
    setDuracao(secs);
    localStorage.setItem(key('duracao_s'), secs);
    bump();
    flush('duracao_s', secs);
  }

  async function handleCheck() {
    const next = !done;
    setDone(next);
    localStorage.setItem(key('done'), next);
    bump();
    if (next) {
      const restSeconds = parseRestSeconds(ex.descanso);
      if (onSetDone) onSetDone(n);
      else if (restSeconds > 0) onRestStart(ex.nome, restSeconds);
    }
    if (!user) return;
    const wId = await saveSetState(day.dia, ex.nome, n, { completed: next });
    if (next && toSeconds(duracao) > 0 && !(parseFloat(carga) > 0)) {
      announceBodyweightPR({
        userId: user.id, ex, day, duracaoS: toSeconds(duracao),
        exclude: { workoutId: wId ?? workoutIds?.[day.dia], setNumber: n }, toast,
      });
    }
  }

  return (
    <div className="set-row-wrap">
      <div className="set-row">
        <span className="set-row__label">{t('Série {n}', { n })}</span>
        <input
          className="set-row__carga" type="text" inputMode="decimal" placeholder="kg" autoComplete="off"
          value={carga} onChange={e => change('carga', e.target.value, setCarga)} onBlur={() => flush('carga', carga)}
          disabled={!started} title={disabledTitle}
        />
        <input
          className="set-row__carga" type="text" inputMode="numeric" placeholder={t('seg')} autoComplete="off"
          aria-label={t('Duração (segundos)')}
          value={duracao} onChange={e => change('duracao_s', e.target.value, setDuracao)} onBlur={() => flush('duracao_s', duracao)}
          disabled={!started} title={disabledTitle}
        />
        <button
          type="button" className={`set-row__check${done ? ' set-row__check--done' : ''}`}
          aria-pressed={done} onClick={handleCheck} disabled={!started} title={disabledTitle}
        >✓</button>
      </div>
      <div className="set-row__timer">
        <button type="button" className="ex-block__apply-btn" onClick={toggleTimer} disabled={!started} title={disabledTitle}>
          {running ? t('⏹ Parar') : t('⏱ Cronometrar')}
        </button>
        {running && (
          <span className={`set-row__timer-clock${planned && elapsed >= planned ? ' set-row__timer-clock--hit' : ''}`}>
            {formatSeconds(elapsed) || '0s'}{planned ? ` / ${formatSeconds(planned)}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
