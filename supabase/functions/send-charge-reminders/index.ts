// Edge Function chamada de hora em hora pelo pg_cron: lembra o aluno do
// vencimento de uma cobrança (na véspera e no dia) e avisa o personal de aluno
// em atraso. Mesmo padrão de send-trainer-alerts: sem usuário logado, Verify
// JWT desativado, age via service role e só aceita x-cron-secret.
//
// Quem avisar é decidido no banco por trainer_charge_candidates(); cada aviso
// só é marcado como enviado (trainer_charge_reminder_log) depois de entregue a
// pelo menos um aparelho do destinatário.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { loadLangs } from '../_shared/lang.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { inAlertWindow, groupBy } from '../_shared/trainerAlerts.ts';
import { buildClientPush, buildLatePush, type ChargeRow } from '../_shared/chargeReminders.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string };
type Logged = { charge_id: string; kind: string; recipient: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function push(subs: Sub[], payload: { title: string; body: string; tag: string }): Promise<boolean> {
  let delivered = false;
  for (const sub of subs) {
    const result = await sendWebPush(sub, payload);
    if (result === 'sent') delivered = true;
    else if (result === 'stale') await supabase.rpc('push_drop_stale', { p_endpoints: [sub.endpoint] });
  }
  return delivered;
}

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const { date, hour } = nowInSaoPaulo();
  if (!inAlertWindow(hour)) return json({ skipped: 'fora do horário de avisos', hour });

  const { data, error } = await supabase.rpc('trainer_charge_candidates');
  if (error) {
    console.error('trainer_charge_candidates error:', error.message);
    return json({ error: error.message }, 500);
  }

  const rows = (data || []) as ChargeRow[];
  if (!rows.length) return json({ hour, candidates: 0, sent: 0 });

  const userIds = [...new Set(rows.map((r) => r.cr_user))];
  const { data: subsData, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (subsErr) {
    console.error('push_subscriptions error:', subsErr.message);
    return json({ error: subsErr.message }, 500);
  }

  const subsByUser = new Map<string, Sub[]>();
  for (const s of (subsData || []) as Sub[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }
  const langs = await loadLangs(supabase, userIds);

  let sent = 0;
  const logged: Logged[] = [];

  // aluno: uma notificação por cobrança
  for (const r of rows.filter((x) => x.cr_role === 'client')) {
    const subs = subsByUser.get(r.cr_user) || [];
    if (!subs.length) continue;
    const msg = buildClientPush(r, langs.get(r.cr_user) ?? 'pt');
    if (await push(subs, { ...msg, tag: `charge-${r.cr_charge}-${r.cr_kind}` })) {
      sent++;
      logged.push({ charge_id: r.cr_charge, kind: r.cr_kind, recipient: r.cr_user });
    }
  }

  // personal: uma notificação por rodada, agrupando os atrasos
  const late = groupBy(rows.filter((x) => x.cr_role === 'trainer'), (r) => r.cr_user);
  for (const [trainerId, list] of late) {
    const subs = subsByUser.get(trainerId) || [];
    if (!subs.length) continue;
    const msg = buildLatePush(list, date, langs.get(trainerId) ?? 'pt');
    if (await push(subs, { ...msg, tag: `charge-late-${date}` })) {
      sent++;
      for (const r of list) logged.push({ charge_id: r.cr_charge, kind: r.cr_kind, recipient: trainerId });
    }
  }

  if (logged.length) {
    const { error: logErr } = await supabase
      .from('trainer_charge_reminder_log')
      .upsert(logged, { onConflict: 'charge_id,kind,recipient', ignoreDuplicates: true });
    if (logErr) console.error('trainer_charge_reminder_log error:', logErr.message);
  }

  return json({ hour, candidates: rows.length, sent });
});
