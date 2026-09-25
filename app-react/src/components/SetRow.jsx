import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { parseRestSeconds } from '../lib/utils';
import { checkForNewPR } from '../lib/records';
import { isNotifyEnabled } from '../lib/notifications';
import { sendPushToSelf } from '../lib/pushSubscriptions';

export default function SetRow({ ex, n, day, bump, onRestStart, onFillOthers, started }) {
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
