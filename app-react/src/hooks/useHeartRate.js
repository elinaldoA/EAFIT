import { useEffect, useRef, useSyncExternalStore } from 'react';
import { addSample, getHeartRateState, readSession, subscribeHeartRate, writeSession } from '../lib/heartRate';

// Estado da cinta cardíaca (status, bpm, nome do aparelho), ver lib/heartRate.js.
export function useHeartRate() {
  return useSyncExternalStore(subscribeHeartRate, getHeartRateState);
}

// Grava as leituras no treino do dia enquanto `recording` (cronômetro
// correndo). Cada leitura nova da cinta vira uma amostra; ao parar, a próxima
// amostra recomeça a contar tempo do zero (pausa não vira tempo em zona).
export function useHeartRateRecorder(dia, recording, maxHr) {
  const session = useRef(null);

  useEffect(() => {
    if (!recording) return;
    session.current = { ...readSession(dia), lastAt: null };
    const unsubscribe = subscribeHeartRate(s => {
      if (s.status !== 'on' || !s.bpm) return;
      session.current = addSample(session.current, s.bpm, maxHr, Date.now());
      writeSession(dia, session.current);
    });
    return () => {
      unsubscribe();
      if (session.current) writeSession(dia, { ...session.current, lastAt: null });
    };
  }, [dia, recording, maxHr]);
}
