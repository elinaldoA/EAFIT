import { useEffect, useState } from 'react';
import { queueSize, SYNC_QUEUE_EVENT } from '../lib/syncQueue';

// Estado da conexão e do que ainda não subiu, para a faixa de offline do treino.
// `navigator.onLine` só garante o "sem rede": com sinal fraco ele diz "online",
// e é a fila de pendências que mostra que algo não chegou ao servidor.
export function useConnection() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [pending, setPending] = useState(() => queueSize());

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const sync = () => setPending(queueSize());
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener(SYNC_QUEUE_EVENT, sync);
    sync();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener(SYNC_QUEUE_EVENT, sync);
    };
  }, []);

  return { online, pending };
}
