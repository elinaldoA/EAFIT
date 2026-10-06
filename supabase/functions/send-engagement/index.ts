// Edge Function chamada de hora em hora pelo pg_cron: dispara as notificações
// automáticas de engajamento (public.engagement_rules). Mesmo padrão de
// send-reminders/send-scheduled-broadcast: sem usuário logado, Verify JWT
// desativado, age via service role e só aceita o header x-cron-secret.
//
// Quem recebe cada tipo (e todas as travas: opt-out, push ativo, intervalo
// mínimo, 1 por dia) é decidido no banco por engagement_candidates() — aqui só
// se escolhe as regras do horário atual, renderiza o texto e envia.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { saveInbox } from '../_shared/inbox.ts';
import { isRuleDue, nowInSaoPaulo, renderTemplate, type EngagementRule } from '../_shared/engagement.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Candidate = { user_id: string; nome: string; vars: Record<string, string | number> };
type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const { date, hour, dow } = nowInSaoPaulo();

  const { data: rules, error: rulesErr } = await supabase
    .from('engagement_rules')
    .select('kind, send_hour, weekdays, per_user_hour, title, body')
    .eq('enabled', true)
    .order('priority', { ascending: true });
  if (rulesErr) return json({ error: rulesErr.message }, 500);

  const summary: { kind: string; candidates: number; sent: number }[] = [];

  // Em sequência (não em paralelo): cada regra grava o log antes da próxima
  // consultar candidatos, é isso que garante no máximo 1 push por usuário/dia.
  for (const rule of (rules || []) as EngagementRule[]) {
    if (!isRuleDue(rule, hour, dow)) continue;

    const { data: candidates, error: candErr } = await supabase.rpc('engagement_candidates', { rule_kind: rule.kind });
    if (candErr) {
      console.error(`engagement_candidates(${rule.kind}) error:`, candErr.message);
      summary.push({ kind: rule.kind, candidates: 0, sent: 0 });
      continue;
    }
    const list = (candidates || []) as Candidate[];
    if (!list.length) {
      summary.push({ kind: rule.kind, candidates: 0, sent: 0 });
      continue;
    }

    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', list.map((c) => c.user_id));
    if (subsErr) {
      console.error('push_subscriptions error:', subsErr.message);
      continue;
    }
    const subsByUser = new Map<string, Sub[]>();
    for (const s of (subs || []) as Sub[]) {
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
      subsByUser.get(s.user_id)!.push(s);
    }

    let sentUsers = 0;
    for (const c of list) {
      const values = { nome: c.nome, ...c.vars };
      const title = renderTemplate(rule.title, values);
      const body = renderTemplate(rule.body, values);

      let delivered = false;
      for (const sub of subsByUser.get(c.user_id) || []) {
        const result = await sendWebPush(sub, { title, body, tag: `engagement-${rule.kind}-${date}` });
        if (result === 'sent') delivered = true;
        else if (result === 'stale') await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }

      if (delivered) {
        sentUsers++;
        const { error: logErr } = await supabase
          .from('notification_log')
          .insert({ user_id: c.user_id, kind: rule.kind, title, body });
        if (logErr) console.error('notification_log insert error:', logErr.message);
        await saveInbox(supabase, [c.user_id], { kind: rule.kind, title, body });
      }
    }
    summary.push({ kind: rule.kind, candidates: list.length, sent: sentUsers });
  }

  return json({ hour, dow, rules: summary });
});
