import { useRef } from 'react';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { buzz } from './haptics';
import { useGeoTracker, geoSupported } from './useGeoTracker';
import { isPaused, setDistance, addRoutePoint, addElevation, updateLiveRun, getLiveRun, autoPauseRun, autoResumeRun } from './liveRun';
import { emptyMotion, motionStep } from './autoPause';

// GPS da corrida ao vivo (LiveRunHost.jsx): soma a distância, desenha o percurso,
// anota a altitude e decide a pausa automática pelas leituras (autoPause.js).
// blockAutoPause: o treino guiado (intervalado, ritmo alvo) não deixa pausar.
export function useAutoPauseTracker(run, { interrupted, autoPauseOn, voiceOn, blockAutoPause }) {
  const running = !!run && !isPaused(run);
  const autoPaused = !!run?.autoPaused;
  const motion = useRef(emptyMotion());
  const prefs = useRef({ autoPauseOn, voiceOn, blockAutoPause });
  prefs.current = { autoPauseOn, voiceOn, blockAutoPause };

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

  return useGeoTracker({
    active: (running || autoPaused) && run.gps && geoSupported() && !interrupted,
    paused: autoPaused,
    baseMeters: run?.meters || 0,
    onMeters: (meters, at) => updateLiveRun(s => setDistance(s, meters, at)),
    onFix: ({ lat, lon, jump, altitude, altitudeAccuracy, at }) => updateLiveRun(s => addElevation(addRoutePoint(s, lat, lon, { jump, now: at }), altitude, altitudeAccuracy)),
    onSample: handleSample,
  });
}
