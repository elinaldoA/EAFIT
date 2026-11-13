import { newAchievements } from './runReadings';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useBackToClose } from '../../hooks/useBackToClose';
import { speak, cancelSpeech } from '../../lib/voice';
import { trackEvent } from '../../lib/tracking';
import { phaseAt } from '../../lib/runIntervals';
import { useGeoTracker, geoSupported } from './useGeoTracker';
import { gpsStatusText } from './gpsStatus';
import { useLiveRun, useNow } from './useLiveRun';
import {
  elapsedMs, isPaused, pauseRun, resumeRun, setDistance, finishRun, splitsOf, addRoutePoint,
  updateLiveRun, setLiveRun, getLiveRun, autoPauseRun, autoResumeRun,
  markRunSeen, interruptedSince, SEEN_EVERY_MS, addElevation, addSteps,
} from './liveRun';
import { emptyMotion, motionStep } from './autoPause';
import { elevationGain, kmElevOf } from './elevation';
import { fetchWeather } from './weather';
import { averageCadence } from './cadence';
import { useStepCounter } from './useStepCounter';
import { useHeartRate } from './useHeartRate';
import { addHeart, heartOf, hrSupported, hrText, maxHeartRate, hrAlert } from './heartRate';
import HrZones from './HrZones';
import { useGuidedWorkout } from './useGuidedWorkout';
import IntervalResults from './IntervalResults';
import GhostBar, { GhostResult } from './GhostBar';
import { gapSpoken } from './ghostText';
import { ghostGapS } from './ghost';
import { STEP_LABEL, formatAmount, describeWorkout, normalizeWorkout, spoken } from './workout';
import SplitBars from './SplitBars';
import { ShoePicker } from './Shoes';
import { newMedals } from './challenges';
import { todayDate } from '../../data/treinoData';
import {
  RUN_SAVED_EVENT, decimal, defaultRunTitle, saveRun, fetchRuns, newRecords, describeRecord, paceSeconds, formatPace, formatClock, formatKm,
  fetchShoes, cachedShoes, defaultShoeId, rememberShoe, shoeUsage, shoeWearNotice,
} from './runs';
import { SESSION_TITLE, describeSession } from './program';
import { privateRoute } from './route';
import RouteDrawing from './RouteDrawing';

import { t } from '../../lib/i18n';
import { VOICE_KEY, AUTOPAUSE_KEY, readPref, writePref } from './runPrefs';

// "12 min", "1 h 05 min".
function gapText(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min < 60 ? t('{v1} min', { v1: min }) : t('{v1} h {v2} min', { v1: Math.floor(min / 60), v2: String(min % 60).padStart(2, '0') });
}

function BackGuard({ onBlocked }) {
  useBackToClose(onBlocked);
  return null;
}

// "1 quilômetro. Tempo 6 minutos e 10 segundos. Ritmo 6:10 por quilômetro."
function kmAnnouncement(km, totalS, splitS) {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return t('{v1} quilômetro(s). Tempo {v2} minutos e {v3} segundos. Último quilômetro em {v4}.', {
    v1: km, v2: m, v3: s, v4: spoken(formatPace(splitS)),
  });
}

// Fica montado o tempo todo no EAFIT Run. Com corrida em andamento cuida do
// que não pode parar (GPS, tela acesa, voz a cada km, corre/caminha, proteção
// contra sair ou recarregar) e mostra a tela da corrida por cima do app.
export default function LiveRunHost() {
  const { user } = useAuth();
  const run = useLiveRun();
  const now = useNow(run);
  const toast = useToast();
  const [guardKey, setGuardKey] = useState(0);
  const [voiceOn, setVoiceOn] = useState(() => readPref(VOICE_KEY));
  const [autoPauseOn, setAutoPauseOn] = useState(() => readPref(AUTOPAUSE_KEY));
  const [finishing, setFinishing] = useState(false);
  // Corrida que estava rodando quando o app fechou: desde quando ficou sem o app.
  const [interrupted, setInterrupted] = useState(() => interruptedSince(getLiveRun()));

  const running = !!run && !isPaused(run);
  const autoPaused = !!run?.autoPaused;
  const motion = useRef(emptyMotion());
  const prefs = useRef({ autoPauseOn, voiceOn, blockAutoPause: false });
  prefs.current = { ...prefs.current, autoPauseOn, voiceOn };

  // Pausa automática: decide pelas leituras do GPS (autoPause.js).
  function handleSample(sample) {
    const cur = getLiveRun();
    if (!cur?.gps || (isPaused(cur) && !cur.autoPaused)) return;
    const step = motionStep(motion.current, sample, !!cur.autoPaused, cur.segmentStart ?? 0);
    motion.current = step.motion;
    if (step.action?.type === 'pause' && prefs.current.autoPauseOn && !prefs.current.blockAutoPause) {
      updateLiveRun(s => autoPauseRun(s, step.action.at));
      if (prefs.current.voiceOn) speak(t('Pausa automática.'));
    } else if (step.action?.type === 'resume') {
      updateLiveRun(s => autoResumeRun(s));
      if (prefs.current.voiceOn) speak(t('Corrida retomada.'));
    }
  }

  const geo = useGeoTracker({
    active: (running || autoPaused) && run.gps && geoSupported() && !interrupted,
    paused: autoPaused,
    baseMeters: run?.meters || 0,
    onMeters: meters => updateLiveRun(s => setDistance(s, meters)),
    onFix: ({ lat, lon, jump, altitude, altitudeAccuracy }) => updateLiveRun(s => addElevation(addRoutePoint(s, lat, lon, { jump }), altitude, altitudeAccuracy)),
    onSample: handleSample,
  });

  useWakeLock(!!run);

  // Cadência: o acelerômetro conta os passos só com a corrida rodando.
  const spm = useStepCounter(running && !interrupted, (steps, ms) => updateLiveRun(s => addSteps(s, steps, ms)));

  // Cinta cardíaca (Bluetooth): conecta no toque; só a corrida rodando conta.
  const heart = useHeartRate(running && !interrupted, (sum, n, max, zones) => updateLiveRun(s => addHeart(s, sum, n, max, zones)), maxHeartRate(user?.user_metadata));

  // Marca que o app está aberto com a corrida (liveRun.interruptedSince).
  const runId = run?.id;
  useEffect(() => {
    if (!runId || interrupted) return undefined;
    const mark = () => markRunSeen(getLiveRun());
    mark();
    const id = setInterval(mark, SEEN_EVERY_MS);
    window.addEventListener('pagehide', mark);
    document.addEventListener('visibilitychange', mark);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', mark);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [runId, interrupted]);

  useEffect(() => {
    if (!run) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [run]);

  // Voz a cada km completo.
  const kmCount = run?.kmMarks.length || 0;
  const spokenKm = useRef(kmCount);
  useEffect(() => {
    if (!run) { spokenKm.current = 0; return; }
    if (kmCount > spokenKm.current && voiceOn) {
      const splits = splitsOf(run.kmMarks);
      const totalS = Math.round(run.kmMarks[kmCount - 1] / 1000);
      const ghostSentence = run.ghost ? ` ${gapSpoken(ghostGapS(run.ghost, totalS, kmCount * 1000))}` : '';
      speak(kmAnnouncement(kmCount, totalS, splits[kmCount - 1]) + ghostSentence, { queue: true });
    }
    spokenKm.current = kmCount;
  }, [kmCount, run, voiceOn]);

  // Corre/caminha: avisa a troca de fase.
  const session = run?.session;
  const runWalk = session?.type === 'corre_caminha' ? { total: session.minutes, run: session.run, walk: session.walk } : null;
  const phase = runWalk ? phaseAt(elapsedMs(run, now), runWalk) : null;
  const phaseName = phase?.phase || null;
  const lastPhase = useRef(null);
  useEffect(() => {
    if (!phaseName) { lastPhase.current = null; return; }
    if (lastPhase.current && lastPhase.current !== phaseName && voiceOn) {
      speak(phaseName === 'run' ? t('Corra!') : phaseName === 'walk' ? t('Caminhe.') : t('Tempo completo. Ótimo trabalho!'));
    }
    lastPhase.current = phaseName;
  }, [phaseName, voiceOn]);

  // Intervalado e ritmo alvo (useGuidedWorkout.js).
  const guided = useGuidedWorkout(run, now, voiceOn);

  // Aviso de voz quando a frequência passa de 80% da máxima numa corrida leve.
  const hrMaxBpm = maxHeartRate(user?.user_metadata);
  const hrState = useRef(null);
  const hrBpm = heart.bpm;
  const hrElapsedS = run ? Math.floor(elapsedMs(run, now) / 1000) : 0;
  useEffect(() => {
    if (!running || !voiceOn) { hrState.current = null; return; }
    const r = hrAlert(hrState.current, hrBpm, hrMaxBpm, hrElapsedS, run?.session);
    hrState.current = r.state;
    if (r.message) speak(r.message, { queue: true });
    // run.session não muda durante a corrida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrElapsedS, hrBpm, hrMaxBpm, running, voiceOn]);
  prefs.current.blockAutoPause = !!guided?.blockAutoPause;

  if (!run) return null;

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    writePref(VOICE_KEY, next);
    if (!next) cancelSpeech();
  };

  const toggleAutoPause = () => {
    const next = !autoPauseOn;
    setAutoPauseOn(next);
    writePref(AUTOPAUSE_KEY, next);
    // Desligou com a corrida parada pela pausa automática: volta a contar.
    if (!next) updateLiveRun(s => autoResumeRun(s));
  };

  if (interrupted) {
    return (
      <InterruptedRun
        run={run} since={interrupted}
        onKeep={() => setInterrupted(null)}
        onCut={() => { updateLiveRun(s => pauseRun(s, Math.max(interrupted, s.segmentStart ?? interrupted))); setInterrupted(null); }}
      />
    );
  }

  return (
    <>
      <BackGuard
        key={guardKey}
        onBlocked={() => {
          toast(t('🏃 Corrida em andamento — finalize para sair'));
          setGuardKey(k => k + 1);
        }}
      />
      {finishing
        ? <FinishRun run={run} now={now} onBack={() => setFinishing(false)} onDone={() => setFinishing(false)} />
        : (
          <LiveRunScreen
            run={run} now={now} geo={geo} phase={phase} voiceOn={voiceOn} onToggleVoice={toggleVoice} spm={spm} heart={heart} guided={guided}
            autoPauseOn={autoPauseOn} onToggleAutoPause={toggleAutoPause}
            onFinish={() => { updateLiveRun(s => pauseRun(s)); setFinishing(true); }}
          />
        )}
    </>
  );
}

// O app ficou fechado com a corrida rodando: o tempo fora conta ou não?
function InterruptedRun({ run, since, onKeep, onCut }) {
  const gap = Date.now() - since;
  return (
    <div className="run-live run-live--finish" role="dialog" aria-modal="true" aria-label={t('Corrida interrompida')}>
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
      </div>
      <h2 className="run-live__title">{t('O app ficou fechado')}</h2>
      <p className="run-live__text">
        {run.gps
          ? t('Sua corrida ficou {v1} sem o app aberto e sem GPS. O que fazer com esse tempo?', { v1: gapText(gap) })
          : t('Sua corrida ficou {v1} sem o app aberto. O que fazer com esse tempo?', { v1: gapText(gap) })}
      </p>
      <div className="run-live__choices">
        <button type="button" className="btn btn--primary run-live__btn" onClick={onCut}>
          {t('⏸ Parar a corrida quando o app fechou')}
        </button>
        <button type="button" className="btn btn--ghost run-live__btn" onClick={onKeep}>
          {t('▶ Continuei correndo: contar esse tempo')}
        </button>
      </div>
      <p className="profile-field__hint">{t('Na dúvida, pare: na tela seguinte dá para continuar a corrida ou finalizar.')}</p>
    </div>
  );
}

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

function LiveRunScreen({ run, now, geo, phase, voiceOn, onToggleVoice, spm, heart, guided, autoPauseOn, onToggleAutoPause, onFinish }) {
  const el = elapsedMs(run, now);
  const totalS = Math.floor(el / 1000);
  const paused = isPaused(run);
  const avgPace = paceSeconds(totalS, run.meters);
  const splits = splitsOf(run.kmMarks);
  const lastSplit = splits.length ? splits[splits.length - 1] : null;
  const [dark, setDark] = useState(false);
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

      <div className="run-live__actions">
        {paused
          ? <button type="button" className="btn btn--primary run-live__btn" onClick={() => updateLiveRun(r => resumeRun(r))}>{t('▶ Continuar')}</button>
          : <button type="button" className="btn btn--ghost run-live__btn" onClick={() => updateLiveRun(r => pauseRun(r))}>{t('⏸ Pausar')}</button>}
        <button type="button" className="btn btn--primary run-live__btn" onClick={onFinish}>{t('🏁 Finalizar')}</button>
      </div>
    </div>
  );
}

const EFFORTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function FinishRun({ run, now, onBack, onDone }) {
  const { user } = useAuth();
  const toast = useToast();
  const [km, setKm] = useState(() => formatKm(run.meters));
  // Só conta como distância corrigida se a pessoa mexeu no campo: o valor
  // mostrado é arredondado e não pode apagar o tempo por km do GPS.
  const [edited, setEdited] = useState(false);
  const [effort, setEffort] = useState(null);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState(() => defaultRunTitle(run.startedAt));
  const [visibility, setVisibility] = useState('amigos');
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const totalS = Math.floor(elapsedMs(run, now) / 1000);
  const zones = user?.user_metadata?.runZones;
  const [shoes, setShoes] = useState(() => cachedShoes(user.id));
  const [shoeId, setShoeId] = useState(() => defaultShoeId(cachedShoes(user.id)));
  const shoeTouched = useRef(false);
  useEffect(() => {
    let alive = true;
    fetchShoes(user.id).then(list => {
      if (!alive) return;
      setShoes(list);
      if (!shoeTouched.current) setShoeId(defaultShoeId(list));
    });
    return () => { alive = false; };
  }, [user.id]);
  const gain = run.gps ? elevationGain(run.elev) : null;
  const cadence = averageCadence(run.steps, run.stepMs);

  async function handleSave() {
    const parsed = Number(String(km).replace(',', '.'));
    if (edited && (!Number.isFinite(parsed) || parsed < 0 || parsed > 500)) return toast(t('⚠️ Distância inválida'));
    setBusy(true);
    const record = finishRun(run, { meters: edited ? parsed * 1000 : undefined, effort, notes, title, visibility, zones, shoeId });
    let previous = [];
    let loaded = false;
    // O clima do começo do percurso (até 4 s; sem internet salva sem ele) busca junto com a lista, sem somar espera.
    const weatherPromise = record.gps ? fetchWeather(run.route) : Promise.resolve(null);
    try { previous = await fetchRuns(user.id); loaded = true; } catch { /* sem rede: sem recorde agora */ }
    record.weather = await weatherPromise;
    const out = await saveRun(user.id, record);
    if (out.lost) { setBusy(false); return toast(t('⚠️ Sem espaço no aparelho para guardar a corrida. Libere espaço e toque em salvar de novo')); }
    const { pending } = out;
    rememberShoe(shoeId);
    const others = previous.filter(r => r.client_id !== record.client_id);
    const records = newRecords(others, record);
    const shoe = shoes.find(x => x.id === shoeId);
    const shoeNotice = shoe ? shoeWearNotice(shoe, shoeUsage([shoe], others)[shoe.id], record.distance_m) : null;
    // Sem a lista (sem internet), toda medalha pareceria nova: só com ela carregada.
    const medals = loaded ? newMedals(others, [...others, record], todayDate()) : [];
    const achieved = loaded ? newAchievements(others, [...others, record]) : [];
    trackEvent('run', record.kind);
    setLiveRun(null);
    setBusy(false);
    onDone();
    window.dispatchEvent(new CustomEvent(RUN_SAVED_EVENT));
    if (pending && out.rejected) toast(t('⚠️ O servidor não aceitou a corrida agora — ela fica no aparelho e tentamos de novo depois'));
    else if (pending) toast(t('📶 Sem internet — a corrida fica no aparelho e sobe sozinha depois'));
    else if (records.length) toast(t('🏆 Novo recorde — {v1}!', { v1: records.map(describeRecord).join(', ') }));
    else if (medals.length) toast(t('🏅 Medalha: {v1}!', { v1: medals.map(m => m.title).join(', ') }));
    else if (achieved.length) toast(t('🎖️ Conquista: {v1}!', { v1: achieved.map(a => a.title).join(', ') }));
    else if (shoeNotice) toast(shoeNotice);
    else toast(t('✅ Corrida salva: {v1} km em {v2}', { v1: formatKm(record.distance_m), v2: formatClock(record.duration_s) }));
  }

  function handleDiscard() {
    if (!confirmDiscard) { setConfirmDiscard(true); return; }
    setLiveRun(null);
    onDone();
    toast(t('Corrida descartada'));
  }

  return (
    <div className="run-live run-live--finish" role="dialog" aria-modal="true" aria-label={t('Finalizar corrida')}>
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
      </div>
      <h2 className="run-live__title">{t('Fim da corrida')}</h2>
      <div className="run-live__clock run-live__clock--small">{formatClock(totalS)}</div>
      {run.ghost && <GhostResult ghost={run.ghost} totalS={totalS} meters={edited ? (Number(String(km).replace(',', '.')) || 0) * 1000 : run.meters} />}
      {(gain !== null || cadence) && (
        <div className="run-live__extra">
          {gain !== null && <span>{t('↗ {v1} m de subida', { v1: gain })}</span>}
          {cadence && <span>{t('👣 {v1} passos/min', { v1: cadence })}</span>}
        </div>
      )}

      {heartOf(run) && (
        <>
          <p className="run-live__extra">{hrText(heartOf(run))}</p>
          <HrZones zones={heartOf(run).z} />
        </>
      )}

      {run.reps?.length > 0 && (
        <div className="profile-field">
          <span className="profile-field__label">{t('Seus tiros')}</span>
          <IntervalResults reps={run.reps} />
        </div>
      )}

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runTitle">{t('Título')}</label>
        <input id="runTitle" className="input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runKm">{t('Distância (km)')}</label>
        <input id="runKm" className="input" inputMode="decimal" value={km} onChange={e => { setKm(e.target.value); setEdited(true); }} />
        {run.gps && run.meters > 0 && <span className="profile-field__hint">{t('Medida pelo GPS. Corrigir a distância apaga o tempo por km desta corrida.')}</span>}
      </div>

      {run.gps && (
        <div className="run-live__route-preview">
          <RouteDrawing route={privateRoute(run.route, zones)} splits={splitsOf(run.kmMarks)} detail width={320} height={150} />
          <span className="profile-field__hint">{t('🔒 Por privacidade, os primeiros e os últimos 200 m do percurso não são salvos.')}</span>
        </div>
      )}

      {!edited && <SplitBars splits={splitsOf(run.kmMarks)} elev={run.gps ? kmElevOf(run.kmElev, run.kmMarks.length) : null} />}

      <ShoePicker shoes={shoes} value={shoeId} onChange={id => { shoeTouched.current = true; setShoeId(id); }} />

      <div className="profile-field">
        <span className="profile-field__label" id="runEffortLabel">{t('Esforço (1 = leve, 10 = máximo)')}</span>
        <div className="run-effort" role="group" aria-labelledby="runEffortLabel">
          {EFFORTS.map(n => (
            <button
              key={n} type="button" aria-pressed={effort === n}
              className={`run-effort__btn${effort === n ? ' run-effort__btn--on' : ''}`}
              onClick={() => setEffort(effort === n ? null : n)}
            >{n}</button>
          ))}
        </div>
      </div>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="runNotes">{t('Anotações')}</label>
        <textarea id="runNotes" className="input" rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('Como foi? Percurso, clima, dor…')} />
      </div>

      <div className="profile-field">
        <span className="profile-field__label" id="runVisLabel">{t('Quem vê')}</span>
        <div className="run-chips" role="group" aria-labelledby="runVisLabel">
          {[['amigos', t('👥 Amigos')], ['privado', t('🔒 Só eu')]].map(([v, label]) => (
            <button key={v} type="button" aria-pressed={visibility === v} className={`run-chip${visibility === v ? ' run-chip--on' : ''}`} onClick={() => setVisibility(v)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="run-live__actions">
        <button type="button" className="btn btn--ghost run-live__btn" onClick={onBack} disabled={busy}>{t('Voltar')}</button>
        <button type="button" className="btn btn--primary run-live__btn" onClick={handleSave} disabled={busy}>{busy ? t('Salvando…') : t('Salvar corrida')}</button>
      </div>
      <button type="button" className="btn btn--ghost btn--sm run-live__discard" onClick={handleDiscard} disabled={busy}>
        {confirmDiscard ? t('Toque de novo para descartar') : t('Descartar corrida')}
      </button>
    </div>
  );
}
