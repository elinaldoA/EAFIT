import { useEffect, useState } from 'react';
import { loadCustomMediaMap } from './exerciseMedia';
import { softFail } from './softFail';

// Mapa de mídias próprias, compartilhado pelos botões da tela.
export function useCustomMedia() {
  const [custom, setCustom] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCustomMediaMap().then(m => { if (alive) setCustom(m); }).catch(softFail('Mídia própria dos exercícios'));
    return () => { alive = false; };
  }, []);
  return custom;
}
