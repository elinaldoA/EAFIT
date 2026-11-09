import { useEffect, useState } from 'react';
import { loadCustomMediaMap } from './exerciseMedia';

// Mapa de mídias próprias, compartilhado pelos botões da tela.
export function useCustomMedia() {
  const [custom, setCustom] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCustomMediaMap().then(m => { if (alive) setCustom(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return custom;
}
