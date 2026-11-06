import { useEffect, useRef, useState } from 'react';
import { emptySteps, addMotion, currentCadence, motionSupported } from './cadence';

const FLUSH_MS = 5000;

// Conta os passos pelo acelerômetro enquanto `active` (corrida rodando).
// A cada FLUSH_MS (e ao parar) chama onFlush(passos, ms) com o que contou
// desde a última vez: a corrida no aparelho não é regravada a cada passo.
// Devolve a cadência do momento (passos/min) ou null.
export function useStepCounter(active, onFlush) {
  const [spm, setSpm] = useState(null);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  useEffect(() => {
    if (!active || !motionSupported()) { setSpm(null); return undefined; }
    let st = emptySteps();
    let sentSteps = 0;
    let sentMs = 0;
    const onMotion = e => {
      const g = e.accelerationIncludingGravity;
      if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y) || !Number.isFinite(g.z)) return;
      st = addMotion(st, Date.now(), Math.hypot(g.x, g.y, g.z));
    };
    const flush = () => {
      const steps = st.steps - sentSteps;
      const ms = st.ms - sentMs;
      sentSteps = st.steps;
      sentMs = st.ms;
      if (ms > 0) onFlushRef.current?.(steps, ms);
      setSpm(currentCadence(st, Date.now()));
    };
    window.addEventListener('devicemotion', onMotion);
    const id = setInterval(flush, FLUSH_MS);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      clearInterval(id);
      flush();
    };
  }, [active]);

  return active ? spm : null;
}
