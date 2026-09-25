import { useEffect } from 'react';
import { todayDate } from '../data/treinoData';

// O PWA costuma ficar aberto em segundo plano de um dia pro outro. todayDate()
// já devolve a data certa a cada chamada, mas o estado carregado na abertura
// (treino do dia, água de hoje, dia destacado) continuaria sendo o de ontem.
// Quando o app volta pro primeiro plano num dia diferente do da abertura,
// recarrega a página — só no retorno (visibilitychange), nunca no meio de um
// uso contínuo, pra não interromper quem está treinando perto da meia-noite.
export function useDayRollover() {
  useEffect(() => {
    const openedOn = todayDate();
    function handleVisibility() {
      if (document.visibilityState === 'visible' && todayDate() !== openedOn) {
        window.location.reload();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}
