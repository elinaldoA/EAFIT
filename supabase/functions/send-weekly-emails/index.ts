// E-mail semanal, chamado pelo pg_cron na segunda de manhã: resumo da semana
// pra quem treinou, convite pra voltar pra quem parou há 1 a 4 semanas e,
// passado isso, a pesquisa "por que você parou?" — uma vez por período parado,
// com texto diferente pra quem sumiu do app e pra quem entra mas não treina
// (regras em _shared/weeklyEmails.ts; respostas em inactivity-reason). Mesmo
// padrão de send-engagement: sem usuário logado, Verify JWT desativado, age
// via service role e só aceita o header x-cron-secret.
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
import { comebackEmail, inactivityEmail, weeklySummaryEmail } from '../_shared/emailTexts.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { surveyLink, surveyToken } from '../_shared/inactivity.ts';
import {
  type ActivityState, canReceiveBulkEmail, isPaused, MAX_BULK_EMAILS, weeklyEmailFor, type WhyEmail,
} from '../_shared/weeklyEmails.ts';

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
type StateRow = { st_user: string; st_last_workout: string | null; st_last_seen: string | null; st_last_asked: string | null };
type State = ActivityState & { lastWorkoutDate: string | null };

// Último treino, último acesso e última pesquisa de cada conta. Se falhar
// (ex.: migration ainda não aplicada) devolve null: o envio segue só com
// resumo e convite pra voltar, sem a pesquisa de inatividade.
async function loadInactivityState(): Promise<Map<string, State> | null> {
  const out = new Map<string, State>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.rpc('email_inactivity_state').range(from, from + PAGE - 1);
    if (error) {
      console.error('email_inactivity_state error:', error.message);
      return null;
    }
    for (const r of (data || []) as StateRow[]) {
      out.set(r.st_user, { lastWorkoutDate: r.st_last_workout, lastSeenDate: r.st_last_seen, lastAskedDate: r.st_last_asked });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

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

  const state = await loadInactivityState();

  const env = { supabaseUrl: SUPABASE_URL, secret: SERVICE_ROLE_KEY };
  const summaries: BulkEmailItem[] = [];
  const comebacks: BulkEmailItem[] = [];
  const whys: { userId: string; pick: WhyEmail; item: BulkEmailItem }[] = [];
  for (const u of users) {
    const count = weekCount.get(u.id) || 0;
    const st = state?.get(u.id);
    const pick = weeklyEmailFor({
      weekCount: count,
      // O estado do banco enxerga o histórico inteiro; a consulta acima, só as últimas semanas.
      lastWorkoutDate: st?.lastWorkoutDate ?? lastWorkout.get(u.id) ?? null,
      createdDate: nowInSaoPaulo(new Date(u.createdAt)).date,
      today,
      activity: st,
    });
    if (!pick) continue;
    if (pick.kind === 'summary') {
      const goal = Number(u.meta.weeklyGoal) > 0 ? Number(u.meta.weeklyGoal) : DEFAULT_WEEKLY_GOAL;
      const volume = Math.round(weekVolume.get(u.id) || 0);
      summaries.push(await bulkEmailItem(u, (lang) => weeklySummaryEmail(lang, count, goal, volume), env));
    } else if (pick.kind === 'comeback') {
      comebacks.push(await bulkEmailItem(u, (lang) => comebackEmail(lang, pick.days, pick.neverTrained), env));
    } else {
      const token = await surveyToken(u.id, SERVICE_ROLE_KEY);
      const item = await bulkEmailItem(u, (lang) => inactivityEmail(lang, pick, (reason) => surveyLink(token, reason)), env);
      whys.push({ userId: u.id, pick, item });
    }
  }

  // Resumo primeiro e pesquisa por último (de quem parou há menos tempo pra
  // quem parou há mais): se o teto do Gmail cortar alguém, que seja quem está
  // parado há mais tempo. Quem ficou de fora da pesquisa recebe na segunda seguinte.
  whys.sort((a, b) => a.pick.days - b.pick.days);
  const queue = [...summaries, ...comebacks, ...whys.map((w) => w.item)];
  const counts = {
    summary: summaries.length,
    comeback: comebacks.length,
    whyAbsent: whys.filter((w) => w.pick.segment === 'absent').length,
    whyIdle: whys.filter((w) => w.pick.segment === 'idle').length,
  };
  if (dry) return json({ dry: true, ...counts, wouldSend: Math.min(queue.length, MAX_BULK_EMAILS) });
  if (queue.length > MAX_BULK_EMAILS) {
    console.error(`send-weekly-emails: ${queue.length} destinatários, enviando só ${MAX_BULK_EMAILS} (limite diário do Gmail)`);
  }
  const firstWhy = summaries.length + comebacks.length;
  const asked: { user_id: string; segment: string; days_inactive: number; never_trained: boolean }[] = [];
  const sent = await sendEmailBatch(queue.slice(0, MAX_BULK_EMAILS), undefined, (index) => {
    if (index < firstWhy) return;
    const { userId, pick } = whys[index - firstWhy];
    asked.push({ user_id: userId, segment: pick.segment, days_inactive: pick.days, never_trained: pick.neverTrained });
  });

  // É este registro que impede a pesquisa de sair de novo na semana seguinte.
  if (asked.length) {
    const { error } = await supabase.from('inactivity_surveys').insert(asked);
    if (error) console.error('inactivity_surveys insert error:', error.message);
  }

  return json({ ...counts, sent });
});
