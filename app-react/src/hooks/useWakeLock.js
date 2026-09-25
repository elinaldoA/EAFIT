import { useEffect } from 'react';

// Mantém a tela acesa enquanto o componente está montado (Screen Wake Lock
// API). O navegador solta a trava sozinho quando a aba vai pro segundo plano,
// então ela é pedida de novo ao voltar. Sem suporte (Safari antigo, Firefox)
// ou com o pedido negado (economia de bateria), só não faz nada.
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let sentinel = null;
    let cancelled = false;

    async function request() {
      if (document.visibilityState !== 'visible') return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) s.release().catch(() => {});
        else sentinel = s;
      } catch { /* negado ou indisponível */ }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) request();
    }

    request();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
