import { useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { useBackToClose } from '../../hooks/useBackToClose';
import { cancelSpeech } from '../../lib/voice';
import { useLiveRun, useNow } from './useLiveRun';
import { elapsedMs, isPaused, pauseRun, updateLiveRun, getLiveRun, autoResumeRun, interruptedSince, addSteps, restoreLiveRun } from './liveRun';
import { useStepCounter } from './useStepCounter';
import { useHeartRate } from './useHeartRate';
import { addHeart, maxHeartRate } from './heartRate';
import { useGuidedWorkout } from './useGuidedWorkout';
import { useAutoPauseTracker } from './useAutoPauseTracker';
import { useKeepRunAlive } from './useKeepRunAlive';
import { useRunBattery } from './useRunBattery';
import { useRunAnnouncements } from './useRunAnnouncements';
import { useRunGuard } from './useRunGuard';
import { t } from '../../lib/i18n';
import { VOICE_KEY, AUTOPAUSE_KEY, readPref, writePref } from './runPrefs';
import InterruptedRun from './InterruptedRun';
import LiveRunScreen from './LiveRunScreen';
import FinishRun from './FinishRun';
import SavedRun from './SavedRun';

function BackGuard({ onBlocked }) {
  useBackToClose(onBlocked);
  return null;
}

// Fica montado o tempo todo no EAFIT Run. Com corrida em andamento junta os
// hooks do que não pode parar (GPS e pausa automática, tela acesa, avisos de
// voz, bateria, sensores, proteção contra sair ou recarregar) e mostra a tela
// da corrida por cima do app.
export default function LiveRunHost() {
  const { user } = useAuth();
  const run = useLiveRun();
  const now = useNow(run);
  const toast = useToast();
  const [guardKey, setGuardKey] = useState(0);
  const [voiceOn, setVoiceOn] = useState(() => readPref(VOICE_KEY));
  const [autoPauseOn, setAutoPauseOn] = useState(() => readPref(AUTOPAUSE_KEY));
  const [finishing, setFinishing] = useState(false);
  const [saved, setSaved] = useState(null); // a corrida que acabou de ser salva (SavedRun)
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
  const hrMaxBpm = maxHeartRate(user?.user_metadata);
  const elapsedS = run ? Math.floor(elapsedMs(run, now) / 1000) : 0;

  // Intervalado e ritmo alvo (useGuidedWorkout.js).
  const guided = useGuidedWorkout(run, now, voiceOn);
  // GPS e pausa automática; o treino guiado não deixa pausar sozinho.
  const geo = useAutoPauseTracker(run, { interrupted, autoPauseOn, voiceOn, blockAutoPause: !!guided?.blockAutoPause });
  const { screenGap, dismissScreenGap } = useKeepRunAlive(run, interrupted);
  const { battery, nudge, dismissNudge } = useRunBattery(run, { interrupted, voiceOn, elapsedS });
  // Cadência: o acelerômetro conta os passos só com a corrida rodando.
  const spm = useStepCounter(running && !interrupted, (steps, ms) => updateLiveRun(s => addSteps(s, steps, ms)));
  // Cinta cardíaca (Bluetooth): conecta no toque; só a corrida rodando conta.
  const heart = useHeartRate(running && !interrupted, (sum, n, max, zones) => updateLiveRun(s => addHeart(s, sum, n, max, zones)), hrMaxBpm);
  const phase = useRunAnnouncements(run, now, voiceOn, { bpm: heart.bpm, maxBpm: hrMaxBpm });
  useRunGuard(run, interrupted);

  // Corrida salva: a em andamento já acabou, mas a tela de "Corrida salva" (com o compartilhar) segue aberta.
  if (!run) return saved ? <SavedRun record={saved} onClose={() => setSaved(null)} /> : null;

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
        ? <FinishRun run={run} now={now} onBack={() => setFinishing(false)} onDone={record => { setFinishing(false); setSaved(record); }} />
        : (
          <LiveRunScreen
            run={run} now={now} geo={geo} phase={phase} voiceOn={voiceOn} onToggleVoice={toggleVoice} spm={spm} heart={heart} guided={guided} battery={battery} batteryNudge={nudge} onDismissNudge={dismissNudge} screenGap={screenGap} onDismissScreenGap={dismissScreenGap}
            autoPauseOn={autoPauseOn} onToggleAutoPause={toggleAutoPause}
            onFinish={() => { updateLiveRun(s => pauseRun(s)); setFinishing(true); }}
          />
        )}
    </>
  );
}
