import { useEffect, useRef, useState } from 'react';
import { gpsStatusText } from './gpsStatus';
import { elapsedMs, isPaused, pauseRun, resumeRun, splitsOf, updateLiveRun, isPersistFailing, addLap, lapsOf, FINISH_HOLD_MS } from './liveRun';
import { elevationGain } from './elevation';
import { hrSupported } from './heartRate';
import GhostBar from './GhostBar';
import { STEP_LABEL, formatAmount, describeWorkout, normalizeWorkout } from './workout';
import { decimal, paceSeconds, formatPace, formatClock, formatKm } from './runs';
import { SESSION_TITLE, describeSession } from './program';
import RouteDrawing from './RouteDrawing';
import { buzz } from './haptics';
import { speak } from '../../lib/voice';
import { startPosition, weatherShort, weatherDetail } from './weather';
import { useStartWeather } from './useStartWeather';
import { batteryState, batteryMessage, nudgeMessage } from './battery';
import { t } from '../../lib/i18n';

// Tela da corrida em andamento: tempo, distância, ritmo, GPS, treino guiado e os botões (LiveRunHost.jsx).

// Texto do alvo da sessão: treino montado, ritmo alvo ou a sessão do programa.
function sessionText(s) {
  if (s?.custom) return describeWorkout(normalizeWorkout(s.custom));
  if (s?.targetPace && (!s.type || s.type === 'livre')) return t('Ritmo alvo {v1}/km', { v1: formatPace(s.targetPace) });
  return describeSession(s);
}

// Etapa atual do intervalado: o que é, quanto falta e o que vem depois.
function WorkoutStep({ guided }) {
  if (guided.done) {
    return <div className="run-live__step run-live__step--done" role="status">{t('✅ Treino concluído: finalize quando quiser')}</div>;
  }
  const { step, next, progress, workout } = guided;
  if (!step || !progress) return null;
  const left = step.unit === 'm' ? formatAmount('m', Math.ceil(progress.left)) : formatClock(Math.ceil(progress.left));
  return (
    <div className={`run-live__step run-live__step--${step.type}`} role="status">
      <span className="run-live__step-label">
        {step.type === 'work' || step.type === 'rest'
          ? t('{v1} · {v2} de {v3}', { v1: STEP_LABEL[step.type], v2: step.rep, v3: workout.reps })
          : STEP_LABEL[step.type]}
      </span>
      <strong className="run-live__step-left">{left}</strong>
      <span className="run-live__step-next">
        {next ? t('Depois: {v1} {v2}', { v1: STEP_LABEL[next.type], v2: formatAmount(next.unit, next.value) }) : t('Última etapa')}
      </span>
      <button type="button" className="btn btn--ghost btn--sm" onClick={guided.skip}>{t('Pular etapa ⏭')}</button>
    </div>
  );
}

export default function LiveRunScreen({ run, now, geo, phase, voiceOn, onToggleVoice, spm, heart, guided, battery, batteryNudge, onDismissNudge, autoPauseOn, onToggleAutoPause, onFinish }) {
  const el = elapsedMs(run, now);
  const totalS = Math.floor(el / 1000);
  const paused = isPaused(run);
  const avgPace = paceSeconds(totalS, run.meters);
  const splits = splitsOf(run.kmMarks);
  const lastSplit = splits.length ? splits[splits.length - 1] : null;
  const [dark, setDark] = useState(false);
  // Finalizar exige segurar o botão (FINISH_HOLD_MS): evita encerrar sem querer no bolso ou com a mão suada.
  // Teclado e leitor de tela mandam só o clique (sem pressionar antes) e finalizam direto.
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef(null);
  const pointerSeen = useRef(false);
  useEffect(() => () => clearTimeout(holdTimer.current), []); // sair da tela no meio do toque não finaliza
  const stopHold = () => { clearTimeout(holdTimer.current); holdTimer.current = null; setHolding(false); };
  function startHold() {
    pointerSeen.current = true;
    setHolding(true);
    buzz('resume');
    holdTimer.current = setTimeout(() => { holdTimer.current = null; setHolding(false); buzz('done'); onFinish(); }, FINISH_HOLD_MS);
  }
  function clickFinish() {
    if (pointerSeen.current) { pointerSeen.current = false; return; } // o toque com o dedo já foi tratado pelo segurar
    onFinish();
  }
  const laps = lapsOf(run);
  // Marca uma volta agora: vibra e, com a voz ligada, diz o tempo e a distância da volta.
  function markLap() {
    const next = addLap(run);
    if (next === run) return;
    updateLiveRun(r => addLap(r));
    buzz('resume');
    if (voiceOn) {
      const lap = lapsOf(next).at(-1);
      speak(t('Parcial {v1}. {v2} minutos e {v3} segundos. {v4} quilômetro(s).', { v1: lap.n, v2: Math.floor(lap.seconds / 60), v3: lap.seconds % 60, v4: formatKm(lap.meters) }), { queue: true });
    }
  }
  // Clima de onde a corrida começou (só com GPS: precisa do percurso); busca de novo a cada 20 min.
  const firstPos = run.gps ? startPosition(run.route) : null;
  const weather = useStartWeather(firstPos);
  const gain = run.gps ? elevationGain(run.elev) : null;
  const s = run.session;
  const target = s?.minutes ? { done: el / 60000, total: s.minutes, label: t('{v1} de {v2} min', { v1: Math.floor(el / 60000), v2: s.minutes }) }
    : s?.km ? { done: run.meters / 1000, total: s.km, label: t('{v1} de {v2} km', { v1: formatKm(run.meters, 1), v2: decimal(s.km) }) }
      : null;

  return (
    <div className="run-live" role="dialog" aria-modal="true" aria-label={t('Corrida em andamento')}>
      {dark && (
        <button type="button" className="run-live__dark" onClick={() => setDark(false)} aria-label={t('Tela escura: toque para voltar')}>
          <span className="run-live__dark-clock">{formatClock(totalS)}</span>
          <span className="run-live__dark-km">{formatKm(run.meters)} {t('km')}</span>
          <span className="run-live__dark-hint">{t('Toque para voltar')}</span>
        </button>
      )}
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
        <div className="run-live__toggles">
          {run.gps && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onToggleAutoPause} aria-pressed={autoPauseOn}>
              {autoPauseOn ? t('Pausa auto ligada') : t('Pausa auto desligada')}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDark(true)}>{t('🌙 Tela escura')}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onToggleVoice} aria-pressed={voiceOn}>
            {voiceOn ? t('🔊 Voz ligada') : t('🔇 Voz desligada')}
          </button>
        </div>
      </div>
      <div className="run-live__session">
        <strong>{SESSION_TITLE[s?.type || 'livre']}</strong>
        {s && <span>{sessionText(s)}</span>}
      </div>
      {battery && batteryState(battery.level, battery.charging) !== 'ok' && (
        <div className={`run-live__battery run-live__battery--${batteryState(battery.level, battery.charging)}`} role="alert">
          <span>{batteryMessage(batteryState(battery.level, battery.charging), battery.level)}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDark(true)}>{t('🌙 Tela escura')}</button>
        </div>
      )}
      {batteryNudge && (
        <div className="run-live__battery" role="status">
          <span>{nudgeMessage()}</span>
          <span className="run-live__battery-actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { onDismissNudge(); setDark(true); }}>{t('🌙 Tela escura')}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDismissNudge}>{t('Entendi')}</button>
          </span>
        </div>
      )}
      {weather && (
        <div className="run-live__weather" aria-label={t('Clima')}>
          <span>{weatherShort(weather)}</span>
          {weatherDetail(weather) && <span>{weatherDetail(weather)}</span>}
        </div>
      )}

      <div className={`run-live__clock${paused ? ' run-live__clock--paused' : ''}`} aria-live="off">{formatClock(totalS)}</div>
      {paused && (
        <div className={`run-live__paused${run.autoPaused ? ' run-live__paused--auto' : ''}`} role="status">
          {run.autoPaused ? t('Pausa automática: volta sozinha quando você andar') : t('Pausada')}
        </div>
      )}

      {phase && phase.phase !== 'done' && (
        <div className={`run-live__phase run-live__phase--${phase.phase}`}>
          {phase.phase === 'run' ? t('🏃 Corra') : t('🚶 Caminhe')} · {formatClock(Math.ceil(phase.remainingMs / 1000))}
        </div>
      )}

      <div className="run-live__stats">
        <div className="run-live__stat">
          <span className="run-live__value">{formatKm(run.meters)}</span>
          <span className="run-live__label">{t('km')}</span>
        </div>
        <div className="run-live__stat">
          <span className="run-live__value">{formatPace(avgPace)}</span>
          <span className="run-live__label">{t('ritmo médio /km')}</span>
        </div>
        <div className="run-live__stat">
          <span className="run-live__value">{formatPace(lastSplit)}</span>
          <span className="run-live__label">{t('último km')}</span>
        </div>
      </div>

      {guided?.steps && <WorkoutStep guided={guided} />}

      {guided?.target && (
        <div className={`run-live__pace run-live__pace--${guided.paceState || 'wait'}`} role="status">
          <span>{t('Alvo {v1}/km', { v1: formatPace(guided.target) })}</span>
          <strong>{guided.pace ? t('agora {v1}', { v1: formatPace(guided.pace) }) : t('medindo…')}</strong>
        </div>
      )}

      {run.ghost && <GhostBar ghost={run.ghost} elapsedS={totalS} meters={run.meters} />}

      {hrSupported() && (
        <div className="run-live__extra">
          {heart.status === 'on' ? (
            <>
              <span>{heart.bpm ? t('❤️ {v1} bpm', { v1: heart.bpm }) : t('❤️ Procurando batimentos…')}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={heart.disconnect}>{t('Desconectar cinta')}</button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" disabled={heart.status === 'connecting'} onClick={heart.connect}>
              {heart.status === 'connecting' ? t('Conectando…') : heart.status === 'error' ? t('❤️ Cinta desconectou: conectar de novo') : t('❤️ Conectar cinta cardíaca')}
            </button>
          )}
        </div>
      )}

      {(gain !== null || spm) && (
        <div className="run-live__extra">
          {gain !== null && <span>{t('↗ {v1} m de subida', { v1: gain })}</span>}
          {spm && <span>{t('👣 {v1} passos/min', { v1: spm })}</span>}
        </div>
      )}

      {target && !guided?.steps && (
        <div className="run-live__target">
          <div className="run-live__bar"><span style={{ width: `${Math.min(100, Math.round((target.done / target.total) * 100))}%` }} /></div>
          <span>{target.label}</span>
        </div>
      )}

      <RouteDrawing route={run.route} width={320} height={130} className="run-route--live" />

      {isPersistFailing() && (
        <div className="run-live__gps" role="alert">
          {t('⚠️ O aparelho está sem espaço para guardar a corrida: não feche o app até finalizar')}
        </div>
      )}

      <div className="run-live__gps">
        {!run.gps ? t('Sem GPS: digite a distância no fim')
          : run.autoPaused ? t('GPS ligado, esperando você voltar a andar')
            : gpsStatusText(geo.status, geo.accuracy)}
      </div>

      {splits.length > 0 && (
        <ol className="run-live__splits" aria-label={t('Tempo por km')}>
          {splits.slice(-3).map((sec, i) => (
            <li key={splits.length - 3 + i}>{t('Km {v1}', { v1: Math.max(1, splits.length - 2) + i })}: {formatPace(sec)}</li>
          ))}
        </ol>
      )}

      {laps.length > 0 && (
        <ol className="run-live__splits run-live__laps" aria-label={t('Parciais marcadas')}>
          {laps.slice(-3).map(l => (
            <li key={l.n}>{t('Parcial {v1}', { v1: l.n })}: {formatClock(l.seconds)} · {t('{v1} km', { v1: formatKm(l.meters) })}</li>
          ))}
        </ol>
      )}

      {!paused && (
        <button type="button" className="btn btn--outline btn--full run-live__lap" onClick={markLap}>{t('⏱ Marcar parcial')}</button>
      )}

      <div className="run-live__actions">
        {paused
          ? <button type="button" className="btn btn--primary run-live__btn" onClick={() => { buzz('resume'); updateLiveRun(r => resumeRun(r)); }}>{t('▶ Continuar')}</button>
          : <button type="button" className="btn btn--ghost run-live__btn" onClick={() => { buzz('pause'); updateLiveRun(r => pauseRun(r)); }}>{t('⏸ Pausar')}</button>}
        <button
          type="button" className={`btn btn--primary run-live__btn run-live__finish${holding ? ' run-live__finish--holding' : ''}`}
          onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
          onContextMenu={e => e.preventDefault()} onClick={clickFinish}
          aria-label={t('Finalizar a corrida (segure o botão)')}
        >{holding ? t('Segure…') : t('🏁 Segure para finalizar')}</button>
      </div>
    </div>
  );
}
