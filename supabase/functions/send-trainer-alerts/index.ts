// Edge Function chamada de hora em hora pelo pg_cron: avisa o personal sobre
// seus alunos (sem treinar, recorde, dor forte) e, na segunda às 8h, manda o
// resumo da semana. Mesmo padrão de send-engagement: sem usuário logado,
// Verify JWT desativado, age via service role e só aceita x-cron-secret.
//
// O que avisar (e para quem) é decidido no banco por trainer_alert_candidates()
// e trainer_weekly_candidates(); cada alerta só é marcado como enviado
// (trainer_alert_log) depois de entregue a pelo menos um aparelho do personal,
// então quem ainda não ativou as notificações recebe quando ativar.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { loadLangs } from '../_shared/lang.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import {
  buildAlertPush, buildWeeklyPush, groupBy, inAlertWindow, isWeeklySummaryTime, type AlertItem,
} from '../_shared/trainerAlerts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type AlertRow = {
  al_trainer: string; al_client: string; al_name: string; al_kind: AlertItem['kind']; al_ref: string; al_detail: string;
};
type WeeklyRow = {
  wk_trainer: string; wk_ref: string; wk_clients: number; wk_active: number; wk_sessions: number; wk_inactive: number; wk_top: string | null;
};
type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function subsByTrainer(trainerIds: string[]): Promise<Map<string, Sub[]>> {
  const out = new Map<string, Sub[]>();
  if (!trainerIds.length) return out;
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', trainerIds);
  if (error) {
    console.error('push_subscriptions error:', error.message);
    return out;
  }
  for (const s of (data || []) as Sub[]) {
    if (!out.has(s.user_id)) out.set(s.user_id, []);
    out.get(s.user_id)!.push(s);
  }
  return out;
}

// Envia para todos os aparelhos do personal; true se algum recebeu.
async function pushToTrainer(subs: Sub[], payload: { title: string; body: string; tag: string }): Promise<boolean> {
  let delivered = false;
  for (const sub of subs) {
    const result = await sendWebPush(sub, payload);
    if (result === 'sent') delivered = true;
    else if (result === 'stale') await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  }
  return delivered;
}

async function markLogged(rows: { trainer_id: string; client_id: string; kind: string; ref: string }[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('trainer_alert_log')
    .upsert(rows, { onConflict: 'trainer_id,client_id,kind,ref', ignoreDuplicates: true });
  if (error) console.error('trainer_alert_log error:', error.message);
}

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const { date, hour, dow } = nowInSaoPaulo();
  if (!inAlertWindow(hour)) return json({ skipped: 'fora do horário de avisos', hour });

  let alertsSent = 0;
  let weeklySent = 0;

  // ---- alertas ------------------------------------------------------------
  const { data: alerts, error: alertsErr } = await supabase.rpc('trainer_alert_candidates');
  if (alertsErr) {
    console.error('trainer_alert_candidates error:', alertsErr.message);
  } else {
    const rows = (alerts || []) as AlertRow[];
    const byTrainer = groupBy(rows, (r) => r.al_trainer);
    const subs = await subsByTrainer([...byTrainer.keys()]);
    const langs = await loadLangs(supabase, [...byTrainer.keys()]);

    for (const [trainerId, list] of byTrainer) {
      const trainerSubs = subs.get(trainerId) || [];
      if (!trainerSubs.length) continue;

      const push = buildAlertPush(list.map((r) => ({ kind: r.al_kind, name: r.al_name, detail: r.al_detail })), langs.get(trainerId) ?? 'pt');
      if (await pushToTrainer(trainerSubs, { ...push, tag: `trainer-alerts-${date}-${hour}` })) {
        alertsSent++;
        await markLogged(list.map((r) => ({ trainer_id: trainerId, client_id: r.al_client, kind: r.al_kind, ref: r.al_ref })));
      }
    }
  }

  // ---- resumo semanal -----------------------------------------------------
  if (isWeeklySummaryTime(hour, dow)) {
    const { data: weekly, error: weeklyErr } = await supabase.rpc('trainer_weekly_candidates');
    if (weeklyErr) {
      console.error('trainer_weekly_candidates error:', weeklyErr.message);
    } else {
      const rows = (weekly || []) as WeeklyRow[];
      const subs = await subsByTrainer(rows.map((r) => r.wk_trainer));
      const langs = await loadLangs(supabase, rows.map((r) => r.wk_trainer));
      for (const r of rows) {
        const trainerSubs = subs.get(r.wk_trainer) || [];
        if (!trainerSubs.length) continue;
        const push = buildWeeklyPush({
          clients: r.wk_clients, active: r.wk_active, sessions: r.wk_sessions, inactive: r.wk_inactive, top: r.wk_top,
        }, langs.get(r.wk_trainer) ?? 'pt');
        if (await pushToTrainer(trainerSubs, { ...push, tag: `trainer-weekly-${r.wk_ref}` })) {
          weeklySent++;
          // o resumo é do próprio personal: client_id = trainer_id
          await markLogged([{ trainer_id: r.wk_trainer, client_id: r.wk_trainer, kind: 'weekly', ref: r.wk_ref }]);
        }
      }
    }
  }

  return json({ hour, dow, alertsSent, weeklySent });
});
