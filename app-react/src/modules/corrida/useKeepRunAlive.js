import { useEffect, useState } from 'react';
import { useWakeLock } from '../../hooks/useWakeLock';
import { isPaused } from './liveRun';
import { useKeepAliveAudio } from './useKeepAliveAudio';
import { buzz } from './haptics';

// Tela apagada por mais que isso (ms) conta como lacuna de GPS.
const SCREEN_GAP_MS = 10000;

// O que mantém a corrida viva (LiveRunHost.jsx): tela acesa e áudio mudo para o
// sistema não congelar o app (e o GPS) com a tela apagada. Tela apagada com a
// corrida rodando: o cronômetro segue (conta por horário), a distância não; ao
// voltar, `screenGap` avisa.
export function useKeepRunAlive(run, interrupted) {
  const running = !!run && !isPaused(run);
  const autoPaused = !!run?.autoPaused;
  const gpsRunning = running && !!run?.gps && !interrupted;
  const [screenGap, setScreenGap] = useState(false);

  useWakeLock(!!run);
  useKeepAliveAudio((running || autoPaused) && !!run?.gps && !interrupted);

  useEffect(() => {
    if (!gpsRunning) { setScreenGap(false); return undefined; }
    let hiddenAt = null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > SCREEN_GAP_MS) { hiddenAt = null; setScreenGap(true); buzz('battery'); }
      else hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [gpsRunning]);

  return { screenGap, dismissScreenGap: () => setScreenGap(false) };
}
