// Edge Function que roda a cada minuto (via pg_cron) e envia notificações Web
// Push para os usuários inscritos, mesmo com o app/navegador fechado. Espelha a
// lógica de lembrete de água que hoje roda só no navegador
// (app-react/src/components/ReminderScheduler.jsx), mas consultando o estado
// real salvo no banco (water_logs) em vez de localStorage.
//
// Também cobre notificações "inteligentes" que dependem de histórico salvo no
// banco (streak em risco, inatividade, resumo semanal, follow-up de desconforto)
// — essas são só server-side, de propósito: rodar a mesma checagem no
// ReminderScheduler.jsx do navegador geraria notificação duplicada no minuto
// exato em que os dois baterem o mesmo horário.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:contato@eafit.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Mantenha em sincronia com WATER_REMINDER_TIMES em
// app-react/src/components/ReminderScheduler.jsx — duplicado de propósito
// porque essa Edge Function (Deno) e o bundle do app (Vite) não compartilham
// módulos, mas os dois precisam disparar no mesmo horário.
const WATER_REMINDER_TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];
const DEFAULT_MACRO_AGUA = 3.5;
const DEFAULT_WEEKLY_GOAL = 5;

const STREAK_RISK_TIME = '20:00';
const STREAK_RISK_MIN = 3;
const INACTIVITY_TIME = '09:00';
const INACTIVITY_MIN_GAP = 2;
const INACTIVITY_MAX_GAP = 14; // acima disso, para de insistir com quem sumiu há muito tempo
const WEEKLY_SUMMARY_TIME = '08:00'; // só às segundas-feiras
const DISCOMFORT_FOLLOWUP_TIME = '09:00'; // mesmo slot de INACTIVITY_TIME, evita mais uma query a cada minuto
const DISCOMFORT_FOLLOWUP_WINDOW_START = 4; // dias atrás
const DISCOMFORT_FOLLOWUP_WINDOW_END = 3; // dias atrás — janela de 2 dias cobre falha de execução num dia exato sem precisar de estado
const HISTORY_LOOKBACK_DAYS = 39; // cobre o badge de streak de 30 dias + a semana do resumo

// Ausente em user_metadata = ligado (opt-out) — usuários que já tinham o switch mestre
// ligado antes dessas preferências existirem continuam recebendo os novos tipos.
function isNotifyEnabled(meta, key) {
  return meta[key] !== false;
}

// Horário de Brasília, igual ao que o navegador do usuário usa (new Date()
// local) — o cron do Postgres roda em UTC, então convertemos explicitamente.
function nowInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

// Constrói a data a partir só dos componentes ano/mês/dia (sem hora), pra day-of-week
// e diferença de dias não dependerem do timezone do runtime do Deno.
function parseDateOnly(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, days) {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(fromStr, toStr) {
  return Math.round((parseDateOnly(toStr) - parseDateOnly(fromStr)) / 86400000);
}

// Porta de app-react/src/lib/utils.js:calcStreak, mas com a data de referência sendo
// ontem em vez de hoje — usado só quando o usuário ainda não treinou hoje, pra saber
// se ele tem uma sequência ativa que está prestes a quebrar.
function calcStreakEndingYesterday(dates, todayStr) {
  const unique = [...new Set(dates)].sort().reverse();
  let streak = 0;
  let prev = addDays(todayStr, -1);
  for (const d of unique) {
    const diff = daysBetween(d, prev);
    if (diff <= 1) { streak++; prev = d; } else break;
  }
  return streak;
}

function daysSinceLastWorkout(dates, todayStr) {
  if (!dates.length) return null;
  const mostRecent = [...dates].sort().reverse()[0];
  return daysBetween(mostRecent, todayStr);
}

Deno.serve(async () => {
  const { date, time } = nowInSaoPaulo();
  const dow = parseDateOnly(date).getDay(); // 0=domingo .. 1=segunda .. 6=sábado

  const { data: subs, error: subsErr } = await supabase.from('push_subscriptions').select('*');
  if (subsErr) return new Response(JSON.stringify({ error: subsErr.message }), { status: 500 });
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  let sent = 0;

  // Um único fetch paginado de todos os usuários em vez de uma chamada admin
  // por usuário por minuto (evita rate limit do GoTrue com mais usuários).
  const metaById = new Map();
  for (let page = 1; ; page++) {
    const { data: usersPage, error: usersErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersErr) return new Response(JSON.stringify({ error: usersErr.message }), { status: 500 });
    for (const u of usersPage.users) metaById.set(u.id, u.user_metadata || {});
    if (usersPage.users.length < 1000) break;
  }

  // Streak em risco / inatividade / resumo semanal só rodam nos horários exatos
  // configurados acima — nos outros 59 minutos da hora, nenhuma query extra roda.
  const isStreakRiskSlot = time === STREAK_RISK_TIME;
  const isInactivitySlot = time === INACTIVITY_TIME;
  const isWeeklySummarySlot = dow === 1 && time === WEEKLY_SUMMARY_TIME;
  const isDiscomfortFollowupSlot = time === DISCOMFORT_FOLLOWUP_TIME;

  const historyByUser = new Map();
  const weeklyCountByUser = new Map();
  const weeklyVolumeByUser = new Map();
  const discomfortByUser = new Map();

  if (isStreakRiskSlot || isInactivitySlot || isWeeklySummarySlot) {
    const historyStart = addDays(date, -HISTORY_LOOKBACK_DAYS);
    const { data: history, error: historyErr } = await supabase
      .from('workouts')
      .select('id, user_id, workout_date')
      .in('user_id', userIds)
      .eq('completed', true)
      .gte('workout_date', historyStart);
    if (historyErr) return new Response(JSON.stringify({ error: historyErr.message }), { status: 500 });

    for (const w of history || []) {
      if (!historyByUser.has(w.user_id)) historyByUser.set(w.user_id, []);
      historyByUser.get(w.user_id).push(w.workout_date);
    }

    if (isWeeklySummarySlot) {
      const lastWeekMonday = addDays(date, -7);
      const lastWeekSunday = addDays(date, -1);
      const lastWeekWorkouts = (history || []).filter(
        (w) => w.workout_date >= lastWeekMonday && w.workout_date <= lastWeekSunday
      );
      userIds.forEach((id) => { weeklyCountByUser.set(id, 0); weeklyVolumeByUser.set(id, 0); });
      lastWeekWorkouts.forEach((w) => weeklyCountByUser.set(w.user_id, (weeklyCountByUser.get(w.user_id) || 0) + 1));

      const workoutIdToUser = new Map(lastWeekWorkouts.map((w) => [w.id, w.user_id]));
      const lastWeekIds = lastWeekWorkouts.map((w) => w.id);
      if (lastWeekIds.length > 0) {
        const { data: sets, error: setsErr } = await supabase
          .from('exercise_sets')
          .select('workout_id, carga')
          .in('workout_id', lastWeekIds)
          .eq('completed', true)
          .not('carga', 'is', null);
        if (setsErr) return new Response(JSON.stringify({ error: setsErr.message }), { status: 500 });
        (sets || []).forEach((s) => {
          const uid = workoutIdToUser.get(s.workout_id);
          const carga = parseFloat(s.carga);
          if (uid && Number.isFinite(carga)) weeklyVolumeByUser.set(uid, (weeklyVolumeByUser.get(uid) || 0) + carga);
        });
      }
    }
  }

  if (isDiscomfortFollowupSlot) {
    const windowStart = addDays(date, -DISCOMFORT_FOLLOWUP_WINDOW_START);
    const windowEnd = addDays(date, -DISCOMFORT_FOLLOWUP_WINDOW_END);
    const { data: discomfort, error: discomfortErr } = await supabase
      .from('exercise_discomfort')
      .select('id, user_id, exercise_name, log_date, severity')
      .in('user_id', userIds)
      .in('severity', ['forte', 'lesao'])
      .gte('log_date', windowStart)
      .lte('log_date', windowEnd);
    if (discomfortErr) return new Response(JSON.stringify({ error: discomfortErr.message }), { status: 500 });

    for (const d of discomfort || []) {
      if (!discomfortByUser.has(d.user_id)) discomfortByUser.set(d.user_id, []);
      discomfortByUser.get(d.user_id).push(d);
    }
  }

  for (const userId of userIds) {
    const meta = metaById.get(userId) || {};
    const macroAgua = Number(meta.macroAgua) > 0 ? Number(meta.macroAgua) : DEFAULT_MACRO_AGUA;
    const userSubs = subs.filter((s) => s.user_id === userId);

    const payloads = [];

    if (WATER_REMINDER_TIMES.includes(time)) {
      const { data: waterLog } = await supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', userId).eq('log_date', date)
        .maybeSingle();
      const currentMl = waterLog?.amount_ml || 0;
      const goalMl = macroAgua * 1000;
      if (currentMl < goalMl) {
        payloads.push({
          title: '💧 Hora de beber água',
          body: `Você bebeu ${(currentMl / 1000).toFixed(1)}L de ${(goalMl / 1000).toFixed(1)}L hoje.`,
          tag: `water-${date}-${time}`,
        });
      }
    }

    if (isStreakRiskSlot && isNotifyEnabled(meta, 'notifyStreakRisk')) {
      const dates = historyByUser.get(userId) || [];
      if (!dates.includes(date)) {
        const streak = calcStreakEndingYesterday(dates, date);
        if (streak >= STREAK_RISK_MIN) {
          payloads.push({
            title: '🔥 Sua sequência está em risco!',
            body: `Você está numa sequência de ${streak} dias. Treine hoje antes da meia-noite pra não perdê-la.`,
            tag: `streak-risk-${date}`,
          });
        }
      }
    }

    if (isInactivitySlot && isNotifyEnabled(meta, 'notifyInactivity')) {
      const dates = historyByUser.get(userId) || [];
      const gap = daysSinceLastWorkout(dates, date);
      if (gap !== null && gap >= INACTIVITY_MIN_GAP && gap <= INACTIVITY_MAX_GAP) {
        payloads.push({
          title: '💤 Sentimos sua falta',
          body: `Já fazem ${gap} dias sem treino. Que tal voltar hoje?`,
          tag: `inactivity-${date}`,
        });
      }
    }

    if (isWeeklySummarySlot && isNotifyEnabled(meta, 'notifyWeeklySummary')) {
      const count = weeklyCountByUser.get(userId) || 0;
      const volume = Math.round(weeklyVolumeByUser.get(userId) || 0);
      const goal = Number(meta.weeklyGoal) > 0 ? Number(meta.weeklyGoal) : DEFAULT_WEEKLY_GOAL;
      payloads.push({
        title: count >= goal ? '🎉 Meta semanal batida!' : '📊 Resumo da semana',
        body: `${count}/${goal} treinos concluídos · ${volume}kg de volume total.`,
        tag: `weekly-summary-${date}`,
      });
    }

    if (isWeeklySummarySlot && isNotifyEnabled(meta, 'notifyWeightUpdate')) {
      const { data: weightLog } = await supabase
        .from('weight_logs')
        .select('id')
        .eq('user_id', userId).eq('log_date', date)
        .maybeSingle();
      if (!weightLog) {
        payloads.push({
          title: '⚖️ Hora de atualizar seu peso',
          body: 'Registre seu peso desta semana no Perfil pra acompanhar sua evolução.',
          tag: `weight-update-${date}`,
        });
      }
    }

    if (isDiscomfortFollowupSlot && isNotifyEnabled(meta, 'notifyDiscomfortFollowup')) {
      for (const d of discomfortByUser.get(userId) || []) {
        payloads.push({
          title: '🩹 Ainda sente essa dor?',
          body: `Você relatou desconforto ${d.severity === 'lesao' ? '(lesão)' : 'forte'} em ${d.exercise_name} há alguns dias. Ainda sente?`,
          tag: `discomfort-followup-${d.id}`,
        });
      }
    }

    for (const payload of payloads) {
      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: payload.title, body: payload.body, tag: payload.tag, url: '/EAFIT/' })
          );
          sent++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else {
            console.error('sendNotification error:', err);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
