import { useEffect, useState } from 'react';
import { readSession, getGps, subscribe } from '../lib/runSession';

// A sessão de corrida e o estado do GPS, atualizados quando mudam (inclusive
// por outra aba do mesmo app, via evento 'storage').
export function useRunSession() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick(n => n + 1);
    const onStorage = e => { if (e.key === 'eafit_run_session') refresh(); };
    const off = subscribe(refresh);
    window.addEventListener('storage', onStorage);
    return () => { off(); window.removeEventListener('storage', onStorage); };
  }, []);
  return { session: readSession(), gps: getGps() };
}

// Tem corrida em andamento? Usado para não recarregar nem trocar a tela do app.
export function useRunInProgress() {
  return !!useRunSession().session?.running;
}
