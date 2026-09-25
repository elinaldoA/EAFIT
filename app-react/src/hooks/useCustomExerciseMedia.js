import { useEffect, useSyncExternalStore } from 'react';
import { getCustomMediaSnapshot, loadCustomMedia, subscribeCustomMedia } from '../lib/customExerciseMedia';

// Mapa nome → { url, type } das mídias próprias. Vários botões "Ver execução"
// na tela compartilham a mesma busca (loadCustomMedia deduplica).
export function useCustomExerciseMedia() {
  const media = useSyncExternalStore(subscribeCustomMedia, getCustomMediaSnapshot);
  useEffect(() => { loadCustomMedia(); }, []);
  return media;
}
