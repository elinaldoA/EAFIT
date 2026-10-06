import { useCallback, useEffect, useState } from 'react';
import { fetchMyMessages, unreadCount, MESSAGES_READ_EVENT } from '../lib/trainerMessages';

// Quantidade de recados do personal ainda não lidos (bolinha na aba Perfil).
// Atualiza ao abrir o app, ao voltar pra ele e a cada 2 minutos; zera na hora
// quando o aluno marca como lido. Falha (sem personal, migration pendente,
// offline) conta como zero, sem barulho.
export function useUnreadMessages(userId) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) { setCount(0); return; }
    fetchMyMessages(20).then(rows => setCount(unreadCount(rows))).catch(() => {});
  }, [userId]);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onRead = () => setCount(0);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    const timer = setInterval(refresh, 120000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(MESSAGES_READ_EVENT, onRead);
      clearInterval(timer);
    };
  }, [refresh]);

  return count;
}
