import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { formatDuration } from '../lib/utils';
import { formatPace, parsePlannedMinutes, readCardio, toPositive, writeCardioField } from '../lib/cardio';
import { parseRunWalk, phaseAt } from '../lib/runIntervals';
import { playRunCue } from '../lib/sound';
import { isRunItem, checkForRunPR, describeRunPR } from '../lib/runStats';
import { geoSupported } from '../hooks/useGeoTracker';
import { useRunSession } from '../hooks/useRunSession';
import { readSession, setSession, endSession, subscribe } from '../lib/runSession';

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

// Preferência do GPS (vale para todas as corridas deste aparelho).
const GPS_KEY = 'cardio_gps_on';
const readGpsPref = () => { try { return localStorage.getItem(GPS_KEY) === 'true'; } catch { return false; } };
const writeGpsPref = on => { try { localStorage.setItem(GPS_KEY, String(on)); } catch { /* sem storage */ } };

// Registro de um item de cardio (sem séries): cronômetro que preenche a
// duração ao parar, distância opcional, ritmo e check. Salva como a série 1
// do item em exercise_sets.
export default function CardioRow({ ex, day, bump, started }) {
  const { user } = useAuth();
  const { saveSetState, workoutIds } = useWorkout();
  const toast = useToast();
  const [vals, setVals] = useState(() => readCardio(ex.nome));
  const [timer, setTimer] = useState(() => readTimer(ex.nome));
  const [now, setNow] = useState(() => Date.now());
  const saveTimers = useRef({});
  const running = !!timer.runningSince;
  const planned = parsePlannedMinutes(ex.reps);
  const runWalk = parseRunWalk(ex.reps);
  const lastPhase = useRef(null);
  const isRun = isRunItem(ex.nome);
  const gpsAvailable = isRun && geoSupported();
  const [gpsOn, setGpsOn] = useState(readGpsPref);
  // A corrida em andamento (GPS, tela acesa, proteções) vive no RunSessionHost;
  // esta linha só registra a sessão e mostra o estado dela.
  const { session, gps: gpsState } = useRunSession();
  const mine = session?.nome === ex.nome;
  const gps = mine ? gpsState : { status: 'idle', accuracy: null };
  const bumpRef = useRef(bump);
  bumpRef.current = bump;

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

  // A distância medida pelo GPS é gravada no localStorage do item pelo host;
  // aqui só relê quando ele avisa (a pessoa ainda pode corrigir o campo).
  useEffect(() => subscribe(() => {
    if (readSession()?.nome !== ex.nome) return;
    const distancia = readCardio(ex.nome).distancia;
    setVals(v => (v.distancia === distancia ? v : { ...v, distancia }));
    bumpRef.current();
  }), [ex.nome]);

  // Voltou a este exercício (F5, app reaberto) com o cronômetro ainda correndo:
  // registra a corrida de novo, para o GPS e as proteções retomarem.
  useEffect(() => {
    if (isRun && timer.runningSince && !readSession()?.running) {
      setSession({ nome: ex.nome, dia: day.dia, running: true, gps: gpsAvailable && gpsOn });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleGps() {
    const next = !gpsOn;
    setGpsOn(next);
    writeGpsPref(next);
    if (mine) setSession({ gps: next });
  }

  function startTimer() {
    const next = { ...timer, runningSince: Date.now() };
    setTimer(next);
    setNow(Date.now());
    writeTimer(ex.nome, next);
    if (isRun) setSession({ nome: ex.nome, dia: day.dia, running: true, gps: gpsAvailable && gpsOn });
  }

  function pauseTimer() {
    const t = Date.now();
    const next = { accumulatedMs: elapsedOf(timer, t), runningSince: null };
    setTimer(next);
    writeTimer(ex.nome, next);
    if (mine) setSession({ running: false });
  }

  // Parar passa o tempo para o campo de duração (em minutos, 1 casa) e zera.
  function stopTimer() {
    const ms = elapsedOf(timer, Date.now());
    const next = { accumulatedMs: 0, runningSince: null };
    setTimer(next);
    writeTimer(ex.nome, next);
    // Distância do GPS ainda no debounce do host: grava já, antes de fechar a sessão.
    if (mine && session.gps) flush('distancia_km', readCardio(ex.nome).distancia);
    endSession(ex.nome);
    if (ms >= 1000) {
      const minutes = String(Math.round((ms / 60000) * 10) / 10);
      setVals(v => ({ ...v, duracao: minutes }));
      writeCardioField(ex.nome, 'duracao', minutes);
      persist({ duracao_min: toPositive(minutes) });
      bump();
    }
  }

  async function toggleDone() {
    const next = !vals.done;
    setVals(v => ({ ...v, done: next }));
    writeCardioField(ex.nome, 'done', String(next));
    bump();
    // Ao concluir com cronômetro ainda correndo, fecha ele primeiro.
    if (next && (running || timer.accumulatedMs)) stopTimer();
    if (!user) return;
    const wId = await saveSetState(day.dia, ex.nome, 1, { completed: next });
    if (!next || !isRunItem(ex.nome)) return;
    try {
      const prs = await checkForRunPR(user.id, { minutes: vals.duracao, km: vals.distancia }, { workoutId: wId ?? workoutIds?.[day.dia], setNumber: 1 });
      if (prs) toast(t('🏆 Novo recorde de corrida — {itens}!', { itens: prs.map(describeRunPR).join(' · ') }));
    } catch (err) {
      console.error('checkForRunPR:', err);
    }
  }

  const pace = formatPace(vals.duracao, vals.distancia);
  const disabled = !started;
  const hint = started ? undefined : t('Inicie o treino para registrar o cardio');
  const elapsed = elapsedOf(timer, now);
  const hasTimer = running || timer.accumulatedMs > 0;
  const cue = runWalk && hasTimer ? phaseAt(elapsed, runWalk) : null;

  // Avisa (som + vibração) a cada troca de fase do corre/caminha; a primeira
  // fase, ao iniciar, não apita.
  const cuePhase = cue?.phase ?? null;
  useEffect(() => {
    if (!running || !cuePhase) { lastPhase.current = null; return; }
    if (lastPhase.current !== null && lastPhase.current !== cuePhase) playRunCue(cuePhase);
    lastPhase.current = cuePhase;
  }, [running, cuePhase]);

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

      {gpsAvailable && (
        <div className="cardio-row__gps">
          <button
            type="button" className={`btn btn--sm ${gpsOn ? 'btn--primary' : 'btn--outline'}`}
            aria-pressed={gpsOn} onClick={toggleGps}
          >{gpsOn ? t('📍 GPS ligado') : t('📍 Usar GPS')}</button>
          {gpsOn && (
            <span className="cardio-row__gps-status" role="status" aria-live="polite">
              {gps.status === 'searching' && t('Buscando sinal de GPS…')}
              {gps.status === 'tracking' && t('GPS ativo · precisão ±{n} m', { n: gps.accuracy })}
              {gps.status === 'weak' && t('⚠️ Sinal de GPS fraco — continue com a tela ligada')}
              {gps.status === 'denied' && t('🚫 Localização negada no navegador — digite a distância')}
              {gps.status === 'insecure' && t('🔒 O GPS só funciona em site seguro (https) — digite a distância')}
              {gps.status === 'error' && t('⚠️ Não foi possível ler o GPS — digite a distância')}
              {gps.status === 'idle' && t('O GPS mede enquanto o cronômetro corre. Mantenha a tela ligada e o app aberto: o navegador não rastreia em segundo plano. O trajeto não é salvo, só a distância.')}
            </span>
          )}
        </div>
      )}

      {cue && (
        <div className={`cardio-row__cue cardio-row__cue--${cue.phase}`} role="status" aria-live="polite">
          {cue.phase === 'done'
            ? t('✅ Tempo do treino completo — pode parar e registrar')
            : <>
                {cue.phase === 'run' ? t('🏃 Corra') : t('🚶 Caminhe')}
                {' · '}<strong>{formatDuration(cue.remainingMs)}</strong>
                {' '}<span className="cardio-row__cue-round">{t('volta {n}', { n: cue.round })}</span>
              </>}
        </div>
      )}

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
