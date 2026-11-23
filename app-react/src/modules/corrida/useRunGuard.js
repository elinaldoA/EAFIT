import { useEffect } from 'react';
import { getLiveRun, markRunSeen, SEEN_EVERY_MS } from './liveRun';

// Proteções da corrida em andamento (LiveRunHost.jsx): marca de tempos em tempos
// que o app está aberto com a corrida (liveRun.interruptedSince) e avisa antes
// de recarregar ou fechar a página.
export function useRunGuard(run, interrupted) {
  const runId = run?.id;
  useEffect(() => {
    if (!runId || interrupted) return undefined;
    const mark = () => markRunSeen(getLiveRun());
    mark();
    const id = setInterval(mark, SEEN_EVERY_MS);
    window.addEventListener('pagehide', mark);
    document.addEventListener('visibilitychange', mark);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', mark);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [runId, interrupted]);

  const hasRun = !!run;
  useEffect(() => {
    if (!hasRun) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasRun]);
}
