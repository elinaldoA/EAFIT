// Edge Function chamada a cada 15 minutos pelo pg_cron: lembra aluno e personal
// das aulas marcadas (na véspera e uma hora antes). Mesmo padrão de
// send-trainer-alerts: sem usuário logado, Verify JWT desativado, age via
// service role e só aceita x-cron-secret.
//
// Quem avisar e quando é decidido no banco por appointment_reminder_candidates();
// cada lembrete só é marcado como enviado (appointment_reminder_log) depois de
// entregue a pelo menos um aparelho do destinatário.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { buildReminderPush, canSendNow, type ReminderRow } from '../_shared/appointmentReminders.ts';
import { loadLangs } from '../_shared/lang.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const { hour } = nowInSaoPaulo();

  const { data, error } = await supabase.rpc('appointment_reminder_candidates');
  if (error) {
    console.error('appointment_reminder_candidates error:', error.message);
    return json({ error: error.message }, 500);
  }

  const rows = ((data || []) as ReminderRow[]).filter((r) => canSendNow(r.ar_kind, hour));
  if (!rows.length) return json({ hour, sent: 0 });

  const userIds = [...new Set(rows.map((r) => r.ar_user))];
  const { data: subsData, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (subsErr) {
    console.error('push_subscriptions error:', subsErr.message);
    return json({ error: subsErr.message }, 500);
  }

  const langs = await loadLangs(supabase, userIds);

  const subsByUser = new Map<string, Sub[]>();
  for (const s of (subsData || []) as Sub[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }

  let sent = 0;
  const logged: { appointment_id: string; kind: string; recipient: string }[] = [];

  for (const r of rows) {
    const subs = subsByUser.get(r.ar_user) || [];
    if (!subs.length) continue;

    const push = buildReminderPush(r, langs.get(r.ar_user) ?? 'pt');
    let delivered = false;
    for (const sub of subs) {
      const result = await sendWebPush(sub, { ...push, tag: `appt-${r.ar_appt}-${r.ar_kind}` });
      if (result === 'sent') delivered = true;
      else if (result === 'stale') await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
    if (delivered) {
      sent++;
      logged.push({ appointment_id: r.ar_appt, kind: r.ar_kind, recipient: r.ar_user });
    }
  }

  if (logged.length) {
    const { error: logErr } = await supabase
      .from('appointment_reminder_log')
      .upsert(logged, { onConflict: 'appointment_id,kind,recipient', ignoreDuplicates: true });
    if (logErr) console.error('appointment_reminder_log error:', logErr.message);
  }

  return json({ hour, candidates: rows.length, sent });
});
