import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { fetchActivePlan } from '../lib/workoutPlans';
import { getDateForWeekday } from '../lib/utils';
import { todayDate } from '../data/treinoData';
import { clearDayLocal } from '../lib/workoutSets';
import { enqueue, flushQueue, queueSize, restoreQueue, SYNC_QUEUE_EVENT } from '../lib/syncQueue';
import { upsertWaterLog } from '../lib/waterLog';
import { upsertProteinLog, upsertNutritionLog } from '../lib/proteinLog';
import { saveCustomFoodRow, deleteCustomFoodRow } from '../lib/nutritionFoods';
import { saveEntryRow, deleteEntryRow } from '../lib/nutritionEntries';
import { writePlanRow } from '../lib/nutritionPlan';
import { upsertWeightLog } from '../lib/weightLog';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { WorkoutContext } from './useWorkout';

import { t } from '../lib/i18n';
import { periodizationInfo, applyPeriodization } from '../lib/periodization';
const RETRY_FIRST_MS = 15 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;

// Reexecuta uma escrita que falhou (ex.: sem internet no momento) quando a fila é esvaziada.
// Cada gravação do treino (status, cronômetro, nota, observações) é um update de
// colunas em `workouts`: o payload da fila é { id, ...colunas } ou, quando o
// treino do dia ainda nem existia, { userId, day, ...colunas }.
function workoutFieldExecutors(kind) {
  return {
    [kind]: async ({ id, ...patch }) => {
      const { error } = await db.from('workouts').update(patch).eq('id', id);
      if (error) throw error;
    },
    [`${kind}_by_day`]: async ({ userId, day, ...patch }) => {
      const wId = await ensureWorkoutId(userId, day);
      const { error } = await db.from('workouts').update(patch).eq('id', wId);
      if (error) throw error;
    },
  };
}

const SYNC_EXECUTORS = {
  ...workoutFieldExecutors('workout_status'),
  ...workoutFieldExecutors('workout_timer'),
  ...workoutFieldExecutors('workout_rating'),
  ...workoutFieldExecutors('workout_notes'),
  // Restos da fila da cinta cardíaca (recurso removido): descarta sem enviar.
  workout_hr: async () => {},
  set_state: async ({ workout_id, exercise_name, set_number, patch }) => {
    const { error } = await db
      .from('exercise_sets')
      .upsert({ workout_id, exercise_name, set_number, ...patch }, { onConflict: 'workout_id,exercise_name,set_number' });
    if (error) throw error;
  },
  // Usados quando a falha aconteceu antes de resolver o workout do dia (ex.: sem
  // internet logo ao abrir o app) — resolvem/criam o workout de novo antes de escrever.
  workout_hr_by_day: async () => {},
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
  protein_log: async ({ userId, date, amountG }) => {
    await upsertProteinLog(userId, date, amountG);
  },
  nutrition_log: async ({ userId, date, totals }) => {
    await upsertNutritionLog(userId, date, totals);
  },
  food_save: async ({ row }) => {
    await saveCustomFoodRow(row);
  },
  entry_save: async ({ row }) => {
    await saveEntryRow(row);
  },
  entry_delete: async ({ userId, id }) => {
    await deleteEntryRow(userId, id);
  },
  food_delete: async ({ userId, id }) => {
    await deleteCustomFoodRow(userId, id);
  },
  plan_save: async ({ userId, meals }) => {
    await writePlanRow(userId, meals);
  },
  weight_log: async ({ userId, date, peso }) => {
    await upsertWeightLog(userId, date, peso);
  },
};

// Cronômetro em andamento no aparelho que começou na data deste treino: o
// servidor só recebe a duração ao finalizar, então não dá para apagá-lo.
function localTimerIsFrom(dayName, workout) {
  if (workout.duration_seconds != null) return false;
  try {
    const timer = JSON.parse(localStorage.getItem(`treino_${dayName}_timer`));
    return !!timer?.startedAt && todayDate(new Date(timer.startedAt)) === workout.workout_date;
  } catch {
    return false;
  }
}

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
// Segunda-feira da semana cujos dados estão no aparelho ('treino_' sai no logout).
const WEEK_MARKER_KEY = 'treino_semana';

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
  const [planProgression, setPlanProgression] = useState(null);
  const [syncStatus, setSyncStatus] = useState(() => (queueSize() > 0 ? 'pending' : 'ok'));
  const [dataVersion, setDataVersion] = useState(0);
  const periodization = useMemo(() => periodizationInfo(planProgression || {}), [planProgression]);
  const periodizedDays = useMemo(() => applyPeriodization(activePlanDays, periodization), [activePlanDays, periodization]);

  // Um envio por vez: o app abrindo, o evento `online`, a volta para a tela e a
  // carga dos dados podem pedir o envio quase juntos; quem chega no meio pega o
  // mesmo envio em andamento em vez de reexecutar a fila em paralelo.
  const flushing = useRef(null);
  const flushPending = useCallback(() => {
    if (!flushing.current) {
      flushing.current = (async () => {
        try {
          const { remaining } = await flushQueue(SYNC_EXECUTORS);
          setSyncStatus(s => (remaining > 0 ? 'pending' : (s === 'pending' ? 'ok' : s)));
          return remaining;
        } finally {
          flushing.current = null;
        }
      })();
    }
    return flushing.current;
  }, []);

  // Usado por páginas fora do fluxo de treino (água, perfil) para sinalizar
  // que enfileiraram uma escrita que falhou.
  const markPending = useCallback(() => setSyncStatus('pending'), []);

  // Quando enviar o que ficou pendente: ao abrir, ao voltar a rede, ao voltar
  // para o app (o navegador nem sempre dispara `online`) e, se ainda sobrar
  // algo, de novo depois de um intervalo que dobra a cada falha (15 s até 5 min).
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    let timer = null;
    let delay = RETRY_FIRST_MS;

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; attempt(); }, delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    }
    // Uma gravação que falha com a fila parada (envio anterior deu certo, sinal
    // fraco) entra na fila sem ninguém olhando: agenda a nova tentativa. Durante
    // um envio em andamento a própria passada agenda se sobrar algo.
    function onQueueChange() {
      if (timer !== null || flushing.current || queueSize() === 0) return;
      schedule();
    }
    async function attempt() {
      const remaining = await flushPending();
      if (!active) return;
      if (remaining > 0) schedule();
      else delay = RETRY_FIRST_MS;
    }
    function onOnline() { delay = RETRY_FIRST_MS; attempt(); }
    function onVisible() {
      if (document.visibilityState === 'visible' && queueSize() > 0) attempt();
    }

    attempt();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(SYNC_QUEUE_EVENT, onQueueChange);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(SYNC_QUEUE_EVENT, onQueueChange);
    };
  }, [user, flushPending]);

  const applyPlanMeta = useCallback((plan) => {
    setPlanExpired(!!plan.expiredNoSuccessor);
    setPlanByTrainer(!!plan.byTrainer);
    setPlanStartDate(plan.startDate || null);
    setPlanEndDate(plan.endDate || null);
    setPlanProgression({ startDate: plan.startDate || null, durationWeeks: plan.durationWeeks ?? null, step: plan.progressionStep ?? null, deloadEvery: plan.deloadEvery ?? null });
  }, []);

  const loadUserData = useCallback(async () => {
    if (!user) return;
    setSyncStatus('loading');
    await restoreQueue(user.id); // fila apagada pelo navegador volta do IndexedDB

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
      // O que foi marcado sem rede precisa chegar ao servidor antes da leitura
      // abaixo: o servidor ainda tem os valores antigos, e eles sobrescreveriam,
      // na tela, o treino que a pessoa acabou de fazer.
      if (queueSize() > 0) await flushPending();

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
          .select('workout_id, exercise_name, set_number, carga, completed, reps, duracao_min, distancia_km, duracao_s, rir, tipo')
          .in('workout_id', wIds);
        if (sErr) throw sErr;
        allSets = sets || [];
      }

      // Com escritas pendentes na fila o cache local é mais novo que o servidor:
      // não o sobrescreve com "dia sem treino".
      const canResetMissing = queueSize() === 0;
      // Semana nova: o que o aparelho guardou dos dias (séries, notas, cronômetro)
      // é da semana passada. Limpa uma vez e deixa o servidor repovoar; dentro da
      // mesma semana nada é apagado, pois o aparelho pode ter marcações mais novas.
      const weekKey = getDateForWeekday('Segunda');
      if (canResetMissing && localStorage.getItem(WEEK_MARKER_KEY) !== weekKey) {
        days.forEach(day => clearDayLocal(day, { keepTimer: (() => { const w = byDate.get(getDateForWeekday(day.dia)); return !!w && localTimerIsFrom(day.dia, w); })() }));
        localStorage.setItem(WEEK_MARKER_KEY, weekKey);
      }
      const ids = {};
      days.forEach(day => {
        const dayName = day.dia;
        const w = byDate.get(getDateForWeekday(dayName));
        if (!w) {
          if (canResetMissing) localStorage.setItem(`treino_${dayName}`, false);
          return;
        }
        ids[dayName] = w.id;
        // Ainda há escrita na fila (sem rede, ou o envio falhou): o aparelho tem
        // dados mais novos que o servidor, então só guarda o id do treino.
        if (!canResetMissing) return;
        localStorage.setItem(`treino_${dayName}`, w.completed);
        allSets.filter(s => s.workout_id === w.id).forEach(s => {
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_carga`, s.carga ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_done`, s.completed);
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_reps`, s.reps ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_duracao`, s.duracao_min ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_distancia`, s.distancia_km ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_duracao_s`, s.duracao_s ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_rir`, s.rir ?? '');
          localStorage.setItem(`set_${s.exercise_name}_${s.set_number}_tipo`, s.tipo ?? '');
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
      setSyncStatus(queueSize() > 0 ? 'pending' : 'ok');
      setDataVersion(v => v + 1);
    } catch (err) {
      console.error('loadUserData:', err);
      // O plano já veio: mostra o treino mesmo assim; só as marcações falharam.
      setActivePlanDays(plan.days);
      setSyncStatus('error');
      toast(t('⚠️ Erro ao sincronizar dados'));
    }
  }, [user, toast, applyPlanMeta, flushPending]);

  useEffect(() => {
    if (user) loadUserData();
    else { setWorkoutIds({}); setActivePlanDays([]); setPlanExpired(false); setPlanStartDate(null); setPlanEndDate(null); setPlanProgression(null); }
    // Depende só do id: o Supabase emite um objeto `user` novo em eventos como
    // TOKEN_REFRESHED/SIGNED_IN (ex.: ao voltar o foco pra aba). Com [user], cada um
    // recarregava tudo e o dataVersion remontava o treino, matando o descanso em andamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function findDay(dayName) {
    return activePlanDays.find(d => d.dia === dayName);
  }

  // Grava colunas de `workouts` do dia; se falhar, entra na fila (kind) para subir depois.
  async function saveWorkoutPatch(kind, dayName, patch) {
    if (!user) return;
    let wId;
    try {
      wId = workoutIds[dayName] || await ensureWorkoutId(user.id, findDay(dayName));
      if (!workoutIds[dayName]) setWorkoutIds(ids => ({ ...ids, [dayName]: wId }));
      const { error } = await db.from('workouts').update(patch).eq('id', wId);
      if (error) throw error;
    } catch (err) {
      console.error(`${kind}:`, err);
      if (wId) enqueue(kind, { id: wId, ...patch });
      else enqueue(`${kind}_by_day`, { userId: user.id, day: findDay(dayName), ...patch });
      setSyncStatus('pending');
    }
  }

  const saveWorkoutStatus = (dayName, completed) => saveWorkoutPatch('workout_status', dayName, { completed });
  const saveWorkoutRating = (dayName, rating) => saveWorkoutPatch('workout_rating', dayName, { rating });
  const saveWorkoutNotes = (dayName, notes) => saveWorkoutPatch('workout_notes', dayName, { notes });
  const saveWorkoutTimer = (dayName, { startedAt, finishedAt, durationSeconds }) => saveWorkoutPatch('workout_timer', dayName, {
    started_at: startedAt ? new Date(startedAt).toISOString() : null,
    finished_at: finishedAt ? new Date(finishedAt).toISOString() : null,
    duration_seconds: durationSeconds ?? null,
  });

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

  // Treino finalizado: o que ficou pendente (sem rede, sinal fraco) tenta subir
  // agora, sem esperar o intervalo da repetição automática nem o evento de rede
  // — é o momento em que a pessoa quer saber se o treino foi salvo. Sem nada
  // na fila não faz nada e devolve null; senão devolve quantas ainda sobraram.
  async function syncAfterFinish() {
    if (queueSize() === 0) return null;
    // Um envio que já estava em andamento pode ter começado antes das últimas
    // gravações entrarem na fila: se sobrar algo, uma segunda passada cobre.
    let remaining = await flushPending();
    if (remaining > 0 || queueSize() > 0) remaining = await flushPending();
    return { remaining };
  }

  async function syncNow() {
    const remaining = await flushPending();
    await loadUserData();
    toast(remaining > 0 ? t('⚠️ Algumas alterações ainda não sincronizaram') : t('✅ Dados sincronizados'));
  }

  return (
    <WorkoutContext.Provider value={{ syncStatus, dataVersion, activePlanDays: periodizedDays, periodization, planExpired, planByTrainer, planStartDate, planEndDate, workoutIds, saveWorkoutStatus, saveSetState, saveWorkoutTimer, saveWorkoutRating, saveWorkoutNotes, syncNow, syncAfterFinish, markPending, refreshPlan: loadUserData }}>
      {children}
    </WorkoutContext.Provider>
  );
}
