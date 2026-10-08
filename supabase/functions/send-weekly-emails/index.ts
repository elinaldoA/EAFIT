// E-mail semanal, chamado pelo pg_cron na segunda de manhã: resumo da semana
// pra quem treinou e convite pra voltar pra quem parou (regras em
// _shared/weeklyEmails.ts). Mesmo padrão de send-engagement: sem usuário
// logado, Verify JWT desativado, age via service role e só aceita o header
// x-cron-secret.
//
// É independente dos lembretes por push (send-reminders, send-engagement):
// alcança também quem não ativou as notificações ou desinstalou o app. Só
// recebe quem tem e-mail confirmado e não se descadastrou (Perfil ou link do
// rodapé); admin, conta suspensa e quem está em modo pausa ficam de fora.
//
// Com ?dry=1 na URL, só conta quem receberia (em qualquer dia da semana) e
// não envia nada: serve pra conferir os números antes de ligar o cron.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { sendEmailBatch } from '../_shared/email.ts';
import { type BulkEmailItem, bulkEmailItem, loadEmailUsers } from '../_shared/emailRecipients.ts';
import { comebackEmail, weeklySummaryEmail } from '../_shared/emailTexts.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { canReceiveBulkEmail, isPaused, MAX_BULK_EMAILS, weeklyEmailFor } from '../_shared/weeklyEmails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const DEFAULT_WEEKLY_GOAL = 5; // mesmo padrão do resumo por push (send-reminders)
const HISTORY_LOOKBACK_DAYS = 35; // semana passada + as 4 semanas do convite pra voltar
const PAGE = 1000; // o PostgREST devolve no máximo 1000 linhas por consulta

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Workout = { id: string; user_id: string; workout_date: string };
type SetRow = { workout_id: string; carga: string | number | null };

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  // O cron já roda só na segunda; a checagem evita reenvio se alguém
  // reagendar o job errado.
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const { date: today, dow } = nowInSaoPaulo();
  if (dow !== 1 && !dry) return json({ skipped: 'só às segundas' });

  const { data: admins, error: adminsErr } = await supabase.from('profiles').select('id').eq('is_admin', true);
  if (adminsErr) return json({ error: adminsErr.message }, 500);
  const adminIds = new Set((admins || []).map((a) => a.id as string));

  const users = (await loadEmailUsers(supabase))
    .filter((u) => !adminIds.has(u.id) && canReceiveBulkEmail(u) && !isPaused(u.meta, today));
  if (!users.length) return json({ summary: 0, comeback: 0, sent: 0 });

  const workouts: Workout[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('workouts')
      .select('id, user_id, workout_date')
      .eq('completed', true)
      .gte('workout_date', addDays(today, -HISTORY_LOOKBACK_DAYS))
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    workouts.push(...((data || []) as Workout[]));
    if (!data || data.length < PAGE) break;
  }

  const weekStart = addDays(today, -7);
  const weekEnd = addDays(today, -1);
  const lastWorkout = new Map<string, string>();
  const weekCount = new Map<string, number>();
  const weekWorkoutUser = new Map<string, string>();
  for (const w of workouts) {
    if (w.workout_date > today) continue;
    if (!lastWorkout.has(w.user_id) || w.workout_date > lastWorkout.get(w.user_id)!) lastWorkout.set(w.user_id, w.workout_date);
    if (w.workout_date >= weekStart && w.workout_date <= weekEnd) {
      weekCount.set(w.user_id, (weekCount.get(w.user_id) || 0) + 1);
      weekWorkoutUser.set(w.id, w.user_id);
    }
  }

  // Volume da semana: soma das cargas das séries concluídas, como no push.
  const weekVolume = new Map<string, number>();
  const weekIds = [...weekWorkoutUser.keys()];
  for (let i = 0; i < weekIds.length; i += 200) {
    const chunk = weekIds.slice(i, i + 200);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('exercise_sets')
        .select('workout_id, carga')
        .in('workout_id', chunk)
        .eq('completed', true)
        .not('carga', 'is', null)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) return json({ error: error.message }, 500);
      for (const s of (data || []) as SetRow[]) {
        const uid = weekWorkoutUser.get(s.workout_id);
        const carga = parseFloat(String(s.carga));
        if (uid && Number.isFinite(carga)) weekVolume.set(uid, (weekVolume.get(uid) || 0) + carga);
      }
      if (!data || data.length < PAGE) break;
    }
  }

  const env = { supabaseUrl: SUPABASE_URL, secret: SERVICE_ROLE_KEY };
  const summaries: BulkEmailItem[] = [];
  const comebacks: BulkEmailItem[] = [];
  for (const u of users) {
    const count = weekCount.get(u.id) || 0;
    const pick = weeklyEmailFor({
      weekCount: count,
      lastWorkoutDate: lastWorkout.get(u.id) ?? null,
      createdDate: nowInSaoPaulo(new Date(u.createdAt)).date,
      today,
    });
    if (!pick) continue;
    if (pick.kind === 'summary') {
      const goal = Number(u.meta.weeklyGoal) > 0 ? Number(u.meta.weeklyGoal) : DEFAULT_WEEKLY_GOAL;
      const volume = Math.round(weekVolume.get(u.id) || 0);
      summaries.push(await bulkEmailItem(u, (lang) => weeklySummaryEmail(lang, count, goal, volume), env));
    } else {
      comebacks.push(await bulkEmailItem(u, (lang) => comebackEmail(lang, pick.days, pick.neverTrained), env));
    }
  }

  // Resumo primeiro: se o teto do Gmail cortar alguém, que seja quem está parado.
  const queue = [...summaries, ...comebacks];
  if (dry) return json({ dry: true, summary: summaries.length, comeback: comebacks.length, wouldSend: Math.min(queue.length, MAX_BULK_EMAILS) });
  if (queue.length > MAX_BULK_EMAILS) {
    console.error(`send-weekly-emails: ${queue.length} destinatários, enviando só ${MAX_BULK_EMAILS} (limite diário do Gmail)`);
  }
  const sent = await sendEmailBatch(queue.slice(0, MAX_BULK_EMAILS));

  return json({ summary: summaries.length, comeback: comebacks.length, sent });
});
