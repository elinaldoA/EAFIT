import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayDate } from '../../data/treinoData';
import { RUN_SAVED_EVENT, fetchRuns, formatKm, decimal } from './runs';
import { runProfileStats, weeklyKmGoal } from './runProfileStats';
import { t } from '../../lib/i18n';

// Resumo do topo do Perfil, já em texto: { week, streak, total }. Recarrega
// quando uma corrida é salva. Sem a lista (carregando ou sem rede), '–'.
export function useRunProfileStats(active, user) {
  const [runs, setRuns] = useState(null);
  const load = useCallback(async () => {
    if (!user) return;
    try { setRuns(await fetchRuns(user.id)); } catch (err) { console.error('useRunProfileStats:', err); }
  }, [user]);

  useEffect(() => {
    if (!active) return undefined;
    load();
    window.addEventListener(RUN_SAVED_EVENT, load);
    return () => window.removeEventListener(RUN_SAVED_EVENT, load);
  }, [active, load]);

  const meta = user?.user_metadata;
  return useMemo(() => {
    if (!runs) return { week: '–', streak: '–', total: '–' };
    const s = runProfileStats(runs, todayDate(), meta?.pauses);
    const goal = weeklyKmGoal(meta);
    return {
      week: goal ? `${formatKm(s.weekMeters, 1)}/${decimal(goal)}` : formatKm(s.weekMeters, 1),
      streak: t('{v1} sem', { v1: s.streakWeeks }),
      total: formatKm(s.totalMeters, 1),
    };
  }, [runs, meta]);
}
