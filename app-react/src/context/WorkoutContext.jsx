import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { fetchActivePlan } from '../lib/workoutPlans';
import { getDateForWeekday } from '../lib/utils';
import { enqueue, flushQueue, queueSize } from '../lib/syncQueue';
import { upsertWaterLog } from '../lib/waterLog';
import { upsertWeightLog } from '../lib/weightLog';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { WorkoutContext } from './useWorkout';

import { t } from '../lib/i18n';
// Reexecuta uma escrita que falhou (ex.: sem internet no momento) quando a fila é esvaziada.
const SYNC_EXECUTORS = {
  workout_status: async ({ id, completed }) => {
    const { error } = await db.from('workouts').update({ completed }).eq('id', id);
    if (error) throw error;
  },
  workout_timer: async ({ id, started_at, finished_at, duration_seconds }) => {
    const { error } = await db.from('workouts').update({ started_at, finished_at, duration_seconds }).eq('id', id);
    if (error) throw error;
  },
  workout_rating: async ({ id, rating }) => {
    const { error } = await db.from('workouts').update({ rating }).eq('id', id);
    if (error) throw error;
  },
  workout_notes: async ({ id, notes }) => {
    const { error } = await db.from('workouts').update({ notes }).eq('id', id);
    if (error) throw error;
  },
  set_state: async ({ workout_id, exercise_name, set_number, patch }) => {
    const { error } = await db
      .from('exercise_sets')
      .upsert({ workout_id, exercise_name, set_number, ...patch }, { onConflict: 'workout_id,exercise_name,set_number' });
    if (error) throw error;
  },
  // Usados quando a falha aconteceu antes de resolver o workout do dia (ex.: sem
  // internet logo ao abrir o app) — resolvem/criam o workout de novo antes de escrever.
  workout_status_by_day: async ({ userId, day, completed }) => {
    const wId = await ensureWorkoutId(userId, day);
    const { error } = await db.from('workouts').update({ completed }).eq('id', wId);
    if (error) throw error;
  },
  workout_timer_by_day: async ({ userId, day, started_at, finished_at, duration_seconds }) => {
    const wId = await ensureWorkoutId(userId, day);
    const { error } = await db.from('workouts').update({ started_at, finished_at, duration_seconds }).eq('id', wId);
    if (error) throw error;
  },
  workout_rating_by_day: async ({ userId, day, rating }) => {
    const wId = await ensureWorkoutId(userId, day);
    const { error } = await db.from('workouts').update({ rating }).eq('id', wId);
    if (error) throw error;
  },
  workout_notes_by_day: async ({ userId, day, notes }) => {
    const wId = await ensureWorkoutId(userId, day);
    const { error } = await db.from('workouts').update({ notes }).eq('id', wId);
    if (error) throw error;
  },
  set_state_by_day: async ({ userId, day, exercise_name, set_number, patch }) => {
    const wId = await ensureWorkoutId(userId, day);
    const { error } = await db
      .from('exercise_sets')
      .upsert({ workout_id: wId, exercise_name, set_number, ...patch }, { onConflict: 'workout_id,exercise_name,set_number' });
    if (error) throw error;
  },
  // Upserts de água/peso são idempotentes (mesma chave = mesmo efeito),
  // então basta reexecutar o mesmo upsert quando a fila é esvaziada.
  water_log: async ({ userId, date, amountMl }) => {
    await upsertWaterLog(userId, date, amountMl);
  },
  weight_log: async ({ userId, date, peso }) => {
    await upsertWeightLog(userId, date, peso);
  },
};

async function createExerciseLogs(workoutId, day) {
  if (!day) return;
  const rows = [
    ...day.exercicios.map(ex => ({ workout_id: workoutId, exercise_name: ex.nome, series: ex.series, reps: ex.reps, rest_time: ex.descanso, technique: ex.tecnica, is_post_workout: false })),
    ...day.pos.map(p => ({ workout_id: workoutId, exercise_name: p.nome, series: p.series, reps: p.reps, rest_time: p.descanso, technique: p.tecnica, is_post_workout: true })),
  ];
  if (!rows.length) return;
  const { error } = await db.from('exercise_logs').insert(rows);
  if (error) console.error('createExerciseLogs:', error);
}

async function findWorkoutId(userId, date) {
  // order+limit: bancos que já tinham linhas duplicadas (antes do índice único
  // de user_id+workout_date) devolvem sempre a mais antiga, em vez de errar.
  const { data, error } = await db
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('workout_date', date)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function ensureWorkoutId(userId, day) {
  const date = getDateForWeekday(day.dia);
  const existing = await findWorkoutId(userId, date);
  if (existing) return existing;

  const { data: created, error: insErr } = await db
    .from('workouts')
    .insert({ user_id: userId, workout_date: date, day_of_week: day.dia, completed: false })
    .select()
    .single();
  if (insErr) {
    // 23505: outra aba/aparelho criou o treino do dia entre o select e o insert.
    if (insErr.code === '23505') {
      const winner = await findWorkoutId(userId, date);
      if (winner) return winner;
    }
    throw insErr;
  }
  await createExerciseLogs(created.id, day);
  return created.id;
}

// Cópia local do plano ativo: sem rede, o app abre com o último plano em vez de
// uma tela de erro. Fica sob a chave 'plan_cache', apagada no logout.
const PLAN_CACHE_KEY = 'plan_cache';

function cachePlan(userId, plan) {
  try { localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({ userId, plan })); } catch { /* cota cheia: segue sem cache */ }
}

function readCachedPlan(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_CACHE_KEY));
    return raw?.userId === userId && Array.isArray(raw.plan?.days) ? raw.plan : null;
  } catch {
    return null;
  }
}

export function WorkoutProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [workoutIds, setWorkoutIds] = useState({});
  const [activePlanDays, setActivePlanDays] = useState([]);
  const [planExpired, setPlanExpired] = useState(false);
  const [planByTrainer, setPlanByTrainer] = useState(false);
  const [planStartDate, setPlanStartDate] = useState(null);
  const [planEndDate, setPlanEndDate] = useState(null);
  const [syncStatus, setSyncStatus] = useState(() => (queueSize() > 0 ? 'pending' : 'ok'));
  const [dataVersion, setDataVersion] = useState(0);

  const flushPending = useCallback(async () => {
    const { remaining } = await flushQueue(SYNC_EXECUTORS);
    setSyncStatus(s => (remaining > 0 ? 'pending' : (s === 'pending' ? 'ok' : s)));
    return remaining;
  }, []);

  // Usado por páginas fora do fluxo de treino (água, perfil) para sinalizar
  // que enfileiraram uma escrita que falhou.
  const markPending = useCallback(() => setSyncStatus('pending'), []);

  useEffect(() => {
    if (!user) return;
    flushPending();
    window.addEventListener('online', flushPending);
    return () => window.removeEventListener('online', flushPending);
  }, [user, flushPending]);

  const applyPlanMeta = useCallback((plan) => {
    setPlanExpired(!!plan.expiredNoSuccessor);
    setPlanByTrainer(!!plan.byTrainer);
    setPlanStartDate(plan.startDate || null);
    setPlanEndDate(plan.endDate || null);
  }, []);

  const loadUserData = useCallback(async () => {
    if (!user) return;
    setSyncStatus('loading');

    let plan;
    try {
      plan = await fetchActivePlan(user.id, user.user_metadata);
      cachePlan(user.id, plan);
    } catch (err) {
      console.error('loadUserData:', err);
      const cached = readCachedPlan(user.id);
      if (cached) {
        // Sem conexão (ou backend fora): segue com o último plano salvo; as
        // marcações feitas agora entram na fila e sobem quando a rede voltar.
        applyPlanMeta(cached);
        setActivePlanDays(cached.days);
        setSyncStatus('error');
        toast(t('📴 Sem conexão — usando os dados salvos no aparelho'));
        return;
      }
      setSyncStatus('error');
      toast(t('⚠️ Erro ao sincronizar dados'));
      return;
    }

    try {
      const days = plan.days;
      applyPlanMeta(plan);
      if (plan.switchInfo) {
        const verdictLabel = plan.switchInfo.verdict === 'positivo' ? t('progressão')
          : plan.switchInfo.verdict === 'negativo' ? t('recuperação') : 'continuidade';
        toast(t('🔄 Ciclo encerrado — ativamos "{toName}" automaticamente ({verdictLabel})', { toName: plan.switchInfo.toName, verdictLabel }));
      }

      // Duas consultas para a semana toda (antes eram três por dia). O treino
      // de um dia só é criado no primeiro registro (ensureWorkoutId), não aqui.
      const dates = days.map(d => getDateForWeekday(d.dia));
      const { data: weekRows, error: wErr } = await db
        .from('workouts')
        .select('id, workout_date, completed, started_at, finished_at, duration_seconds, rating, notes')
        .eq('user_id', user.id)
        .in('workout_date', dates)
        .order('created_at', { ascending: true });
      if (wErr) throw wErr;

      const byDate = new Map();
      (weekRows || []).forEach(w => { if (!byDate.has(w.workout_date)) byDate.set(w.workout_date, w); });

      const wIds = [...byDate.values()].map(w => w.id);
      let allSets = [];
      if (wIds.length) {
        const { data: sets, error: sErr } = await db
          .from('exercise_sets')
          .select('workout_id, exercise_name, set_number, carga, completed, reps, duracao_min, distancia_km')
          .in('workout_id', wIds);
        if (sErr) throw sErr;
        allSets = sets || [];
      }

      // Com escritas pendentes na fila o cache local é mais novo que o servidor:
      // não o sobrescreve com "dia sem treino".
      const canResetMissing = queueSize() === 0;
      const ids = {};
      days.forEach(day => {
        const dayName = day.dia;
        const w = byDate.get(getDateForWeekday(dayName));
        if (!w) {
          if (canResetMissing) localStorage.setItem(`treino_${dayName}`, false);
          return;
        }
        ids[dayName] = w.id;
        localStorage.setItem(`treino_${dayName}`, w.completed);
        allSets.filter(s => s.workout_id === w.id).forEach(s => {
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_carga`, s.carga ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_done`, s.completed);
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_reps`, s.reps ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_duracao`, s.duracao_min ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_distancia`, s.distancia_km ?? '');
        });
        if (w.rating != null) localStorage.setItem(`treino_${dayName}_rating`, w.rating);
        if (w.notes) localStorage.setItem(`treino_${dayName}_notes`, w.notes);
        if (w.duration_seconds != null) {
          localStorage.setItem(`treino_${dayName}_timer`, JSON.stringify({
            status: 'finished',
            accumulatedMs: w.duration_seconds * 1000,
            runningSince: null,
            startedAt: w.started_at ? new Date(w.started_at).getTime() : null,
            finishedAt: w.finished_at ? new Date(w.finished_at).getTime() : null,
          }));
        }
      });

      setActivePlanDays(days);
      setWorkoutIds(ids);
      setSyncStatus('ok');
      setDataVersion(v => v + 1);
    } catch (err) {
      console.error('loadUserData:', err);
      // O plano já veio: mostra o treino mesmo assim; só as marcações falharam.
      setActivePlanDays(plan.days);
      setSyncStatus('error');
      toast(t('⚠️ Erro ao sincronizar dados'));
    }
  }, [user, toast, applyPlanMeta]);

  useEffect(() => {
    if (user) loadUserData();
    else { setWorkoutIds({}); setActivePlanDays([]); setPlanExpired(false); setPlanStartDate(null); setPlanEndDate(null); }
    // Depende só do id: o Supabase emite um objeto `user` novo em eventos como
    // TOKEN_REFRESHED/SIGNED_IN (ex.: ao voltar o foco pra aba). Com [user], cada um
    // recarregava tudo e o dataVersion remontava o treino, matando o descanso em andamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function findDay(dayName) {
    return activePlanDays.find(d => d.dia === dayName);
  }

  async function saveWorkoutStatus(dayName, completed) {
    if (!user) return;
    let wId;
    try {
      wId = workoutIds[dayName] || await ensureWorkoutId(user.id, findDay(dayName));
      if (!workoutIds[dayName]) setWorkoutIds(ids => ({ ...ids, [dayName]: wId }));
      const { error } = await db.from('workouts').update({ completed }).eq('id', wId);
      if (error) throw error;
    } catch (err) {
      console.error('saveWorkoutStatus:', err);
      if (wId) {
        enqueue('workout_status', { id: wId, completed });
      } else {
        enqueue('workout_status_by_day', { userId: user.id, day: findDay(dayName), completed });
      }
      setSyncStatus('pending');
    }
  }

  async function saveWorkoutTimer(dayName, { startedAt, finishedAt, durationSeconds }) {
    if (!user) return;
    let wId;
    const payload = {
      started_at: startedAt ? new Date(startedAt).toISOString() : null,
      finished_at: finishedAt ? new Date(finishedAt).toISOString() : null,
      duration_seconds: durationSeconds ?? null,
    };
    try {
      wId = workoutIds[dayName] || await ensureWorkoutId(user.id, findDay(dayName));
      if (!workoutIds[dayName]) setWorkoutIds(ids => ({ ...ids, [dayName]: wId }));
      const { error } = await db.from('workouts').update(payload).eq('id', wId);
      if (error) throw error;
    } catch (err) {
      console.error('saveWorkoutTimer:', err);
      if (wId) {
        enqueue('workout_timer', { id: wId, ...payload });
      } else {
        enqueue('workout_timer_by_day', { userId: user.id, day: findDay(dayName), ...payload });
      }
      setSyncStatus('pending');
    }
  }

  async function saveWorkoutRating(dayName, rating) {
    if (!user) return;
    let wId;
    try {
      wId = workoutIds[dayName] || await ensureWorkoutId(user.id, findDay(dayName));
      if (!workoutIds[dayName]) setWorkoutIds(ids => ({ ...ids, [dayName]: wId }));
      const { error } = await db.from('workouts').update({ rating }).eq('id', wId);
      if (error) throw error;
    } catch (err) {
      console.error('saveWorkoutRating:', err);
      if (wId) {
        enqueue('workout_rating', { id: wId, rating });
      } else {
        enqueue('workout_rating_by_day', { userId: user.id, day: findDay(dayName), rating });
      }
      setSyncStatus('pending');
    }
  }

  async function saveWorkoutNotes(dayName, notes) {
    if (!user) return;
    let wId;
    try {
      wId = workoutIds[dayName] || await ensureWorkoutId(user.id, findDay(dayName));
      if (!workoutIds[dayName]) setWorkoutIds(ids => ({ ...ids, [dayName]: wId }));
      const { error } = await db.from('workouts').update({ notes }).eq('id', wId);
      if (error) throw error;
    } catch (err) {
      console.error('saveWorkoutNotes:', err);
      if (wId) {
        enqueue('workout_notes', { id: wId, notes });
      } else {
        enqueue('workout_notes_by_day', { userId: user.id, day: findDay(dayName), notes });
      }
      setSyncStatus('pending');
    }
  }

  async function saveSetState(dayName, exerciseName, setNumber, patch) {
    if (!user) return;
    let wId;
    try {
      wId = workoutIds[dayName] || await ensureWorkoutId(user.id, findDay(dayName));
      if (!workoutIds[dayName]) setWorkoutIds(ids => ({ ...ids, [dayName]: wId }));
      const { error } = await db
        .from('exercise_sets')
        .upsert(
          { workout_id: wId, exercise_name: exerciseName, set_number: setNumber, ...patch },
          { onConflict: 'workout_id,exercise_name,set_number' }
        );
      if (error) throw error;
      return wId;
    } catch (err) {
      console.error('saveSetState:', err);
      if (wId) {
        enqueue('set_state', { workout_id: wId, exercise_name: exerciseName, set_number: setNumber, patch });
      } else {
        enqueue('set_state_by_day', { userId: user.id, day: findDay(dayName), exercise_name: exerciseName, set_number: setNumber, patch });
      }
      setSyncStatus('pending');
      return wId;
    }
  }

  async function syncNow() {
    const remaining = await flushPending();
    await loadUserData();
    toast(remaining > 0 ? t('⚠️ Algumas alterações ainda não sincronizaram') : t('✅ Dados sincronizados'));
  }

  return (
    <WorkoutContext.Provider value={{ syncStatus, dataVersion, activePlanDays, planExpired, planByTrainer, planStartDate, planEndDate, workoutIds, saveWorkoutStatus, saveSetState, saveWorkoutTimer, saveWorkoutRating, saveWorkoutNotes, syncNow, markPending, refreshPlan: loadUserData }}>
      {children}
    </WorkoutContext.Provider>
  );
}
