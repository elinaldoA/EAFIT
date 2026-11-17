import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useBackToClose } from '../../hooks/useBackToClose';
import { speak, cancelSpeech } from '../../lib/voice';
import { phaseAt } from '../../lib/runIntervals';
import { useGeoTracker, geoSupported } from './useGeoTracker';
import { useLiveRun, useNow } from './useLiveRun';
import { elapsedMs, isPaused, pauseRun, setDistance, splitsOf, addRoutePoint, updateLiveRun, getLiveRun, autoPauseRun, autoResumeRun, markRunSeen, interruptedSince, SEEN_EVERY_MS, addElevation, addSteps, restoreLiveRun } from './liveRun';
import { emptyMotion, motionStep } from './autoPause';
import { useStepCounter } from './useStepCounter';
import { useHeartRate } from './useHeartRate';
import { addHeart, maxHeartRate, hrAlert } from './heartRate';
import { useGuidedWorkout } from './useGuidedWorkout';
import { gapSpoken } from './ghostText';
import { ghostGapS } from './ghost';
import { spoken } from './workout';
import { formatPace } from './runs';
import { t } from '../../lib/i18n';
import { buzz } from './haptics';
import { useBattery } from './useBattery';
import { batteryState, batterySpoken } from './battery';
import { VOICE_KEY, AUTOPAUSE_KEY, readPref, writePref } from './runPrefs';
import InterruptedRun from './InterruptedRun';
import LiveRunScreen from './LiveRunScreen';
import FinishRun from './FinishRun';

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

  // Corrida que o localStorage perdeu mas a cópia do IndexedDB guardou: volta
  // como "ficou sem o app" e a pessoa decide o que fazer com o tempo.
  useEffect(() => {
    let alive = true;
    restoreLiveRun().then(restored => { if (alive && restored) setInterrupted(interruptedSince(getLiveRun())); });
    return () => { alive = false; };
  }, []);

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
      buzz('pause');
      if (prefs.current.voiceOn) speak(t('Pausa automática.'));
    } else if (step.action?.type === 'resume') {
      updateLiveRun(s => autoResumeRun(s));
      buzz('resume');
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

  // Bateria acabando: banner na tela da corrida e, ao cruzar 20% e 10%, vibra e avisa por voz.
  const battery = useBattery(!!run && !interrupted);
  const batteryLevel = battery?.level ?? null;
  const batteryNow = battery ? batteryState(battery.level, battery.charging) : 'ok';
  const lastBattery = useRef('ok');
  const hasRun = !!run;
  useEffect(() => {
    if (!hasRun) { lastBattery.current = 'ok'; return; }
    const prev = lastBattery.current;
    lastBattery.current = batteryNow;
    // Só quando piora (ok → baixa → crítica); carregar e voltar a descer avisa de novo.
    if (batteryNow !== 'ok' && batteryNow !== prev && !(prev === 'critical' && batteryNow === 'low')) {
      buzz('battery');
      if (voiceOn) speak(batterySpoken(batteryNow, batteryLevel), { queue: true });
    }
    // batteryLevel e voiceOn só entram na fala: não devem disparar o aviso sozinhos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batteryNow, hasRun]);

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
    if (kmCount > spokenKm.current) buzz('km');
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
    if (lastPhase.current && lastPhase.current !== phaseName) buzz(phaseName === 'run' ? 'run' : phaseName === 'walk' ? 'walk' : 'done');
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
            run={run} now={now} geo={geo} phase={phase} voiceOn={voiceOn} onToggleVoice={toggleVoice} spm={spm} heart={heart} guided={guided} battery={battery}
            autoPauseOn={autoPauseOn} onToggleAutoPause={toggleAutoPause}
            onFinish={() => { updateLiveRun(s => pauseRun(s)); setFinishing(true); }}
          />
        )}
    </>
  );
}
