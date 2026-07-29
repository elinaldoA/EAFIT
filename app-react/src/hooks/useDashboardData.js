import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { TODAY_DATE } from '../data/treinoData';
import { fmtDate, parseLocalDate, toDateStr, calcStreak } from '../lib/utils';
import { countPhotos } from '../lib/progressPhotos';
import { fetchWeightLogs } from '../lib/weightLog';
import { fetchAllDiscomfort } from '../lib/discomfort';
import { syncAchievements } from '../lib/achievements';
import { isNotifyEnabled } from '../lib/notifications';
import { sendPushToSelf } from '../lib/pushSubscriptions';

// Busca e deriva os dados da tela de Evolução: treinos/séries dos últimos 60
// dias (para gráficos), e separadamente o histórico completo (para PRs,
// streak e conquistas, que dependem de todo o passado do usuário).
export function useDashboardData(active, user, toast) {
  const [workouts, setWorkouts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allTimeLogs, setAllTimeLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPR, setLoadingPR] = useState(false);
  const [unlockedBadges, setUnlockedBadges] = useState(new Set());
  const [discomfortHistory, setDiscomfortHistory] = useState([]);
  const [weightLogs, setWeightLogs] = useState([]);
  // PRs/streak/conquistas exigem o histórico inteiro de treinos — buscar isso
  // de novo toda vez que a aba fica ativa fica cada vez mais pesado conforme
  // o histórico cresce, então só carrega uma vez por sessão (com refresh manual).
  const hasLoadedAllTimeRef = useRef(false);

  const loadAllTimeLogs = useCallback(async () => {
    if (!user) return;
    setLoadingPR(true);
    try {
      const { data: allWorkouts, error: awErr } = await db
        .from('workouts')
        .select('id, workout_date, completed')
        .eq('user_id', user.id);
      if (awErr) throw awErr;

      const ids = (allWorkouts || []).map(w => w.id);
      if (ids.length) {
        const { data: sets, error: sErr } = await db
          .from('exercise_sets')
          .select('exercise_name, carga, reps, workout_id')
          .in('workout_id', ids)
          .eq('completed', true)
          .not('carga', 'is', null);
        if (sErr) throw sErr;

        const dateMap = Object.fromEntries(allWorkouts.map(w => [w.id, w.workout_date]));
        setAllTimeLogs((sets || []).map(s => ({ ...s, workout_date: dateMap[s.workout_id] })));
      } else {
        setAllTimeLogs([]);
      }

      const completedWorkouts = (allWorkouts || []).filter(w => w.completed);
      const streakDays = calcStreak(completedWorkouts.map(w => w.workout_date));

      const [totalPhotos, weights] = await Promise.all([
        countPhotos(user.id),
        fetchWeightLogs(user.id),
      ]);

      const { unlockedIds, newlyEarned } = await syncAchievements(user.id, {
        streakDays,
        totalTreinos: completedWorkouts.length,
        totalPhotos,
        totalWeightLogs: weights.length,
      });
      setUnlockedBadges(unlockedIds);
      setWeightLogs(weights);
      newlyEarned.forEach(b => {
        toast(`🏅 Conquista desbloqueada: ${b.title}`);
        if (isNotifyEnabled(user.user_metadata, 'notifyRecords')) {
          sendPushToSelf({ title: '🏅 Conquista desbloqueada!', body: b.title, tag: `badge-${b.id}` })
            .catch(err => console.error('sendPushToSelf:', err));
        }
      });
      hasLoadedAllTimeRef.current = true;
    } catch (err) {
      console.error('loadAllTimeLogs:', err);
      toast('⚠️ Erro ao carregar recordes e conquistas');
    } finally {
      setLoadingPR(false);
    }
  }, [user, toast]);

  function handleRefreshRecords() {
    hasLoadedAllTimeRef.current = false;
    loadAllTimeLogs();
  }

  useEffect(() => {
    if (!active || !user || loading) return;

    async function loadDashboard() {
      setLoading(true);
      try {
        // Ancora em TODAY_DATE (fuso de Brasília), não em `new Date()` local +
        // toISOString() (UTC) — mesmo ajuste feito em HidratacaoPage.jsx, evita
        // que a janela de 60 dias fique deslocada dependendo do fuso do navegador.
        const since = parseLocalDate(TODAY_DATE);
        since.setDate(since.getDate() - 59);
        const sinceStr = toDateStr(since);

        const { data: w, error: wErr } = await db
          .from('workouts')
          .select('id, workout_date, completed, day_of_week')
          .eq('user_id', user.id)
          .gte('workout_date', sinceStr)
          .order('workout_date', { ascending: true });
        if (wErr) throw wErr;
        setWorkouts(w || []);

        const ids = (w || []).map(x => x.id);
        if (ids.length > 0) {
          const { data: sets, error: sErr } = await db
            .from('exercise_sets')
            .select('exercise_name, carga, workout_id')
            .in('workout_id', ids)
            .eq('completed', true)
            .not('carga', 'is', null);
          if (sErr) throw sErr;

          const dateMap = Object.fromEntries((w || []).map(x => [x.id, x.workout_date]));
          setLogs((sets || []).map(s => ({ ...s, workout_date: dateMap[s.workout_id] })));
        } else {
          setLogs([]);
        }

        setDiscomfortHistory(await fetchAllDiscomfort(user.id));
      } catch (err) {
        console.error('loadDashboard:', err);
        toast('⚠️ Erro ao carregar evolução');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
    if (!hasLoadedAllTimeRef.current) loadAllTimeLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  // Une logs (60 dias) com allTimeLogs pro seletor não esconder exercícios
  // cujo último registro é mais antigo que a janela recente — PRList (que usa
  // allTimeLogs) já mostrava esses exercícios, o seletor de carga não devia
  // ficar mais restrito que a lista de recordes na mesma seção.
  const exercises = useMemo(
    () => [...new Set(
      [...logs, ...allTimeLogs].filter(l => !isNaN(parseFloat(l.carga))).map(l => l.exercise_name)
    )].sort(),
    [logs, allTimeLogs]
  );

  const volumePoints = useMemo(() => {
    const totals = {};
    logs.forEach(l => {
      const val = parseFloat(l.carga);
      if (isNaN(val)) return;
      totals[l.workout_date] = (totals[l.workout_date] || 0) + val;
    });
    return Object.keys(totals).sort().map(date => ({ value: totals[date], label: fmtDate(date) }));
  }, [logs]);

  return {
    workouts, logs, allTimeLogs, loading, loadingPR, unlockedBadges, discomfortHistory, weightLogs,
    exercises, volumePoints, handleRefreshRecords,
  };
}
