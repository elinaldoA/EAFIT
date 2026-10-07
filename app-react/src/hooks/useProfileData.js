import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { getWeekStart, calcStreak } from '../lib/utils';
import { fetchWeightLogs } from '../lib/weightLog';

import { t } from '../lib/i18n';
// Estatísticas de frequência (total/semana/sequência) e histórico de peso da tela de Perfil.
export function useProfileData(active, user, toast) {
  const [stats, setStats] = useState({ total: '–', week: '–', streak: '–' });
  const [weightLogs, setWeightLogs] = useState([]);

  useEffect(() => {
    if (!active || !user) return;

    async function loadProfileData() {
      try {
        const [{ data: workouts, error }, weights] = await Promise.all([
          db.from('workouts').select('id, workout_date, duration_seconds').eq('user_id', user.id).eq('completed', true).order('workout_date', { ascending: false }),
          fetchWeightLogs(user.id),
        ]);
        if (error) throw error;
        setWeightLogs(weights);

        const total = workouts.length;
        const wStart = getWeekStart();
        const week = workouts.filter(w => w.workout_date >= wStart).length;
        const streak = calcStreak(workouts.map(w => w.workout_date), user.user_metadata?.pauses);

        setStats({ total, week, streak: streak > 0 ? `${streak}d` : '0d' });
      } catch (err) {
        console.error('loadProfileStats:', err);
        toast(t('⚠️ Erro ao carregar estatísticas'));
      }
    }

    loadProfileData();
  }, [active, user, toast]);

  return { stats, weightLogs, setWeightLogs };
}
