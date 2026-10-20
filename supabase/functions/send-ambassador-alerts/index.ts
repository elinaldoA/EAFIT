// Edge Function chamada de hora em hora pelo pg_cron: avisa embaixadores e
// influenciadores quando entram contas novas pelo link deles (o toque abre o
// modo do programa no app). Mesmo padrão de
// send-trainer-alerts: sem usuário logado, Verify JWT desativado, age via
// service role e só aceita x-cron-secret.
//
// Quem avisar vem de ambassador_signup_candidates(); o aviso só é marcado
// (ambassador_mark_notified) depois de entregue a pelo menos um aparelho, então
// quem ainda não ativou as notificações recebe o acumulado quando ativar.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { loadLangs } from '../_shared/lang.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { inAlertWindow } from '../_shared/trainerAlerts.ts';
import { alertsKind, buildSignupPush, signupTag } from '../_shared/ambassadorAlerts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type CandidateRow = {
  as_id: string; as_user: string; as_kind: string; as_new: number; as_total: number; as_until: string;
};
type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string };

async function markNotified(r: CandidateRow) {
  const { error } = await supabase.rpc('ambassador_mark_notified', { p_id: r.as_id, p_until: r.as_until });
  if (error) console.error('ambassador_mark_notified error:', error.message);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const { date, hour } = nowInSaoPaulo();
  if (!inAlertWindow(hour)) return json({ skipped: 'fora do horário de avisos', hour });

  const { data, error } = await supabase.rpc('ambassador_signup_candidates');
  if (error) {
    console.error('ambassador_signup_candidates error:', error.message);
    return json({ error: error.message }, 500);
  }
  const all = (data || []) as CandidateRow[];
  for (const r of all.filter((x) => !alertsKind(x.as_kind))) await markNotified(r);
  const rows = all.filter((x) => alertsKind(x.as_kind));
  if (!rows.length) return json({ hour, candidates: 0, sent: 0 });

  const userIds = rows.map((r) => r.as_user);
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
  for (const r of rows) {
    const subs = subsByUser.get(r.as_user) || [];
    if (!subs.length) continue;

    const push = buildSignupPush({ kind: r.as_kind, fresh: Number(r.as_new), total: Number(r.as_total) }, langs.get(r.as_user) ?? 'pt');
    let delivered = false;
    for (const sub of subs) {
      const result = await sendWebPush(sub, { ...push, tag: signupTag(date, hour) });
      if (result === 'sent') delivered = true;
      else if (result === 'stale') await supabase.rpc('push_drop_stale', { p_endpoints: [sub.endpoint] });
    }
    if (!delivered) continue;
    sent++;
    await markNotified(r);
  }

  return json({ hour, candidates: rows.length, sent });
});
