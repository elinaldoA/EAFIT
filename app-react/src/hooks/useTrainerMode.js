import { useCallback, useEffect, useState } from 'react';
import { fetchIsTrainer } from '../lib/trainer';
import { readMode, writeMode, readCachedIsTrainer, writeCachedIsTrainer } from '../lib/appMode';

// Descobre se o usuário logado é personal e em que modo está usando o app.
// Falha de rede mantém o último valor conhecido (não derruba o app).
export function useTrainerMode(userId) {
  const [isTrainer, setIsTrainer] = useState(() => (userId ? readCachedIsTrainer(userId) : false));
  const [mode, setModeState] = useState(readMode);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchIsTrainer()
      .then(v => { if (active) { setIsTrainer(v); writeCachedIsTrainer(userId, v); } })
      .catch(err => console.error('fetchIsTrainer:', err));
    return () => { active = false; };
  }, [userId]);

  const setMode = useCallback(next => { writeMode(next); setModeState(next); }, []);

  return { isTrainer, mode, setMode };
}
