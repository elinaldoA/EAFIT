import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { calcStreak, getWeekStart } from '../lib/utils';

// Dias seguidos treinando (e treinos da semana) para o selo do topo do app.
// Uma consulta leve por abertura, guardada no aparelho até o dia mudar: o selo
// não pode custar uma ida ao servidor a cada troca de aba.
export function useStreak(user) {
  const [info, setInfo] = useState(null);
  const userId = user?.id;
  const pauses = user?.user_metadata?.pauses;

  useEffect(() => {
    if (!userId || typeof db?.from !== 'function') return undefined;
    const day = getWeekStart(0) + ':' + new Date().toDateString();
    const key = `eafit_streak:${userId}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (cached && cached.day === day) { setInfo(cached.info); return undefined; }
    } catch { /* sem storage */ }
    let alive = true;
    (async () => {
      try {
        const { data, error } = await db.from('workouts').select('workout_date').eq('user_id', userId).eq('completed', true).order('workout_date', { ascending: false }).limit(400);
        if (error || !data || !alive) return;
        const dates = data.map(w => w.workout_date);
        const next = { streak: calcStreak(dates, pauses), week: dates.filter(d => d >= getWeekStart(0)).length };
        setInfo(next);
        try { sessionStorage.setItem(key, JSON.stringify({ day, info: next })); } catch { /* sem storage */ }
      } catch { /* sem rede: o selo só não aparece */ }
    })();
    return () => { alive = false; };
  }, [userId, pauses]);

  return info;
}
