// Edge Function chamada de hora em hora pelo pg_cron: avisa quem usa o EAFIT Run
// de um desafio novo da comunidade e de quem foi ultrapassado no ranking. Mesmo
// padrão de send-ambassador-alerts: sem usuário logado, Verify JWT desativado,
// age via service role e só aceita x-cron-secret.
//
// Quem avisar e o estado (desafio já anunciado, última posição) vêm de
// run_challenge_alerts_collect(), que avança o estado na própria chamada: o aviso
// sai no máximo uma vez. O sino do app guarda o texto mesmo sem push ativo.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { loadLangs } from '../_shared/lang.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { inAlertWindow } from '../_shared/trainerAlerts.ts';
import { buildRunChallengePush, isKnownAlert, runChallengeTag } from '../_shared/runChallengeAlerts.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type AlertRow = { rca_user: string; rca_kind: string; rca_challenge: string; rca_title: string; rca_rank: number | null };
type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  // Fora do horário nada é coletado: o estado só avança quando o aviso pode sair.
  const { date, hour } = nowInSaoPaulo();
  if (!inAlertWindow(hour)) return json({ skipped: 'fora do horário de avisos', hour });

  const { data, error } = await supabase.rpc('run_challenge_alerts_collect');
  if (error) {
    console.error('run_challenge_alerts_collect error:', error.message);
    return json({ error: error.message }, 500);
  }
  const rows = ((data || []) as AlertRow[]).filter((r) => isKnownAlert(r.rca_kind));
  if (!rows.length) return json({ hour, alerts: 0, sent: 0 });

  const userIds = [...new Set(rows.map((r) => r.rca_user))];
  const subsByUser = new Map<string, Sub[]>();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data: subsData, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', userIds.slice(i, i + 500));
    if (subsErr) {
      console.error('push_subscriptions error:', subsErr.message);
      continue;
    }
    for (const s of (subsData || []) as Sub[]) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id)!.push(s);
    }
  }
  const langs = await loadLangs(supabase, userIds);
  const pushFor = (r: AlertRow) =>
    buildRunChallengePush({ kind: r.rca_kind, title: r.rca_title, rank: r.rca_rank }, langs.get(r.rca_user) ?? 'pt');

  // Sino do app: sempre, com ou sem push.
  const bell = rows.map((r) => ({ user_id: r.rca_user, kind: 'run_challenge', ...pushFor(r) }));
  for (let i = 0; i < bell.length; i += 500) {
    const { error: bellErr } = await supabase.from('user_notifications').insert(bell.slice(i, i + 500));
    if (bellErr) console.error('user_notifications error:', bellErr.message);
  }

  let sent = 0;
  for (const r of rows) {
    const subs = subsByUser.get(r.rca_user) || [];
    if (!subs.length) continue;
    const push = pushFor(r);
    let delivered = false;
    for (const sub of subs) {
      const result = await sendWebPush(sub, { ...push, tag: runChallengeTag(r.rca_kind, r.rca_challenge, date) });
      if (result === 'sent') delivered = true;
      else if (result === 'stale') await supabase.rpc('push_drop_stale', { p_endpoints: [sub.endpoint] });
    }
    if (delivered) sent++;
  }

  return json({ hour, alerts: rows.length, sent });
});
