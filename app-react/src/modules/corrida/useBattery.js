import { useEffect, useState } from 'react';

// Nível (0 a 100) e se está carregando, ou null onde o navegador não deixa ler.
// Atualiza quando o nível ou o carregador mudam. Só lê enquanto `active`.
export function useBattery(active) {
  const [battery, setBattery] = useState(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') {
      setBattery(null);
      return undefined;
    }
    let alive = true;
    let manager = null;
    const read = () => { if (alive && manager) setBattery({ level: Math.round(manager.level * 100), charging: !!manager.charging }); };
    navigator.getBattery().then(b => {
      if (!alive) return;
      manager = b;
      read();
      b.addEventListener('levelchange', read);
      b.addEventListener('chargingchange', read);
    }).catch(() => {});
    return () => {
      alive = false;
      if (manager) {
        manager.removeEventListener('levelchange', read);
        manager.removeEventListener('chargingchange', read);
      }
    };
  }, [active]);

  return battery;
}
