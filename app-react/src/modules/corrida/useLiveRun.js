import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLiveRun, subscribeLiveRun, isPaused } from './liveRun';

// A corrida em andamento (liveRun.js), atualizada quando muda — inclusive por
// outra aba do app.
export function useLiveRun() {
  return useSyncExternalStore(subscribeLiveRun, getLiveRun, () => null);
}

// "Agora" que anda a cada segundo enquanto a corrida roda (cronômetro na tela).
export function useNow(run) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = !!run && !isPaused(run);
  useEffect(() => {
    if (!ticking) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  return ticking ? now : (run?.updatedAt ?? now);
}
