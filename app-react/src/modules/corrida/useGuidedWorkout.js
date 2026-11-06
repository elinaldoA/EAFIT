import { useEffect, useMemo, useRef, useState } from 'react';
import { speak } from '../../lib/voice';
import { elapsedMs, getLiveRun, updateLiveRun } from './liveRun';
import {
  sessionWorkout, needsGps, withoutGps, buildSteps, startPosition, advanceWorkout, skipStep, stepProgress,
  stepAnnouncement, rollingPace, pushSample, paceAlert, paceStatus,
} from './workout';

// Treino guiado da corrida ao vivo (workout.js): acompanha a etapa do
// intervalado, avisa por voz cada troca e confere o ritmo alvo. A posição
// fica na corrida do aparelho (run.workoutPos), então recarregar a página
// continua da mesma etapa.
export function useGuidedWorkout(run, now, voiceOn) {
  const session = run?.session || null;
  const gps = !!run?.gps;
  const workout = useMemo(() => {
    const w = sessionWorkout(session);
    if (!w) return null;
    return !gps && needsGps(w) ? withoutGps(w) : w;
  }, [session, gps]);
  const steps = useMemo(() => (workout ? buildSteps(workout) : null), [workout]);
  const elapsedS = run ? Math.floor(elapsedMs(run, now) / 1000) : 0;
  const meters = run?.meters || 0;
  const pos = run?.workoutPos || null;
  const voice = useRef(voiceOn);
  voice.current = voiceOn;
  const say = text => { if (voice.current) speak(text, { queue: true }); };

  // Começa na primeira etapa e avança quando ela termina.
  useEffect(() => {
    if (!steps) return;
    const cur = getLiveRun();
    if (!cur) return;
    if (!cur.workoutPos) {
      updateLiveRun(s => (s && !s.workoutPos ? { ...s, workoutPos: startPosition() } : s));
      say(stepAnnouncement(steps[0], workout.reps));
      return;
    }
    const next = advanceWorkout(cur.workoutPos, steps, elapsedS, meters);
    if (next !== cur.workoutPos) {
      updateLiveRun(s => (s ? { ...s, workoutPos: next } : s));
      say(stepAnnouncement(steps[next.index], workout.reps));
    }
    // say só fala; muda a cada render sem mudar o efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, workout, elapsedS, meters]);

  const step = steps && pos ? steps[pos.index] || null : null;
  const target = workout ? (step?.type === 'work' ? workout.targetPace : null) : (session?.targetPace || null);

  // Ritmo dos últimos ~300 m, recomeçando a cada etapa.
  const samples = useRef([]);
  const [pace, setPace] = useState(null);
  const stepIndex = pos?.index ?? null;
  useEffect(() => { samples.current = []; setPace(null); }, [stepIndex]);
  useEffect(() => {
    if (!run) return;
    samples.current = pushSample(samples.current, elapsedS, meters);
    setPace(rollingPace(samples.current));
    // só quando a distância muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meters]);

  const lastAlert = useRef(null);
  useEffect(() => {
    const { lastAt, message } = paceAlert(lastAlert.current, pace, target, elapsedS);
    lastAlert.current = lastAt;
    if (message) say(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pace, target]);

  if (!run) return null;

  const skip = () => {
    if (!steps) return;
    const cur = getLiveRun();
    if (!cur?.workoutPos) return;
    const next = skipStep(cur.workoutPos, steps, elapsedS, meters);
    updateLiveRun(s => (s ? { ...s, workoutPos: next } : s));
    say(stepAnnouncement(steps[next.index], workout.reps));
  };

  return {
    workout,
    steps,
    step,
    next: steps && pos ? steps[pos.index + 1] || null : null,
    done: !!steps && !!pos && pos.index >= steps.length,
    progress: step && pos ? stepProgress(step, pos, elapsedS, meters) : null,
    target,
    pace,
    paceState: paceStatus(pace, target),
    skip,
    // Trote por tempo: parar é o esperado, a pausa automática não congela o cronômetro.
    blockAutoPause: step?.type === 'rest' && step.unit === 's',
  };
}
