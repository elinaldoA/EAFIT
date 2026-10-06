import { useEffect } from 'react';
import { db } from '../lib/supabase';
import { fetchMyGoals } from '../lib/trainerInsights';

const seenKey = userId => `eafit_goals_seen:${userId}`;

// Quando o personal define metas, elas são gravadas nos dados do aluno no
// servidor, mas o app só enxerga isso ao renovar a sessão. Ao abrir o app, se
// existe uma meta mais nova que a última vista neste aparelho, renova a
// sessão uma vez pra o app já usar a meta nova.
export function useTrainerGoalsSync(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    (async () => {
      try {
        const goals = await fetchMyGoals();
        if (!active || !goals) return;
        let seen = null;
        try { seen = localStorage.getItem(seenKey(userId)); } catch { /* sem storage */ }
        if (seen === goals.at) return;
        await db.auth.refreshSession();
        try { localStorage.setItem(seenKey(userId), goals.at); } catch { /* sem storage */ }
      } catch {
        // sem personal / migration pendente / offline: segue sem sincronizar
      }
    })();
    return () => { active = false; };
  }, [userId]);
}
