// Relatório semanal e alertas da equipe (painel: Sistema → Relatórios e
// alertas). Chamada pelo cron de hora em hora (header x-cron-secret, Verify JWT
// desativado, como send-engagement):
//   - confere os alertas (ops_alert_check) e manda e-mail e push aos admins
//     quando um passa do limite, respeitando o intervalo de repetição;
//   - às segundas às 8h (Brasília) manda o relatório da semana.
// Também aceita um admin logado com { mode: 'digest_me' }: manda o relatório
// agora só para quem pediu (botão "Enviar para mim" no painel).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { corsHeadersFor } from '../_shared/cors.ts';
import { sendEmail, sendEmailBatch } from '../_shared/email.ts';
import { renderEmail } from '../_shared/emailLayout.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import {
  ALERT_LABELS, type AlertRow, type DigestMetrics, alertEmail, digestEmail, dueAlerts, isDigestTime,
} from '../_shared/adminDigest.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function recipients(kind: 'digest' | 'alerts'): Promise<{ user_id: string; email: string }[]> {
  const { data, error } = await admin.rpc('ops_admin_recipients', { p_kind: kind });
  if (error) {
    console.error('ops_admin_recipients error:', error.message);
    return [];
  }
  return data || [];
}

async function loadMetrics(): Promise<DigestMetrics | null> {
  const { data, error } = await admin.rpc('ops_digest_metrics');
  if (error) {
    console.error('ops_digest_metrics error:', error.message);
    return null;
  }
  return data as DigestMetrics;
}

async function runAlerts() {
  const { data, error } = await admin.rpc('ops_alert_check');
  if (error) {
    console.error('ops_alert_check error:', error.message);
    return { fired: [] as string[] };
  }
  const due = dueAlerts((data || []) as AlertRow[]);
  if (!due.length) return { fired: [] as string[] };

  const to = await recipients('alerts');
  const email = renderEmail('pt', alertEmail(due));
  const sent = await sendEmailBatch(to.map((r) => ({ to: r.email, email })));

  // Push nos aparelhos dos admins que querem alertas.
  if (to.length) {
    const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth')
      .in('user_id', to.map((r) => r.user_id));
    const title = `⚠️ ${due.map((a) => ALERT_LABELS[a.ac_key] || a.ac_key).join(', ')}`;
    for (const sub of subs || []) {
      const result = await sendWebPush(sub, { title, body: due.map((a) => a.ac_detail).join(' · '), tag: 'admin-alert' });
      if (result === 'stale') await admin.rpc('push_drop_stale', { p_endpoints: [sub.endpoint] });
    }
  }

  const now = new Date().toISOString();
  await admin.from('admin_alert_rules').update({ last_fired_at: now }).in('key', due.map((a) => a.ac_key));
  await admin.from('admin_alert_log').insert(due.map((a) => ({
    key: a.ac_key, value: a.ac_value, threshold: a.ac_threshold, detail: a.ac_detail, notified: sent,
  })));
  return { fired: due.map((a) => a.ac_key) };
}

async function runDigest(only?: { email: string }) {
  const m = await loadMetrics();
  if (!m) return { sent: 0 };
  const email = renderEmail('pt', digestEmail(m));
  if (only) return { sent: (await sendEmail(only.email, email)) === 'sent' ? 1 : 0 };
  const to = await recipients('digest');
  const sent = await sendEmailBatch(to.map((r) => ({ to: r.email, email })));
  await admin.from('admin_alert_log').insert({ key: 'relatorio', detail: 'relatório semanal', notified: sent });
  return { sent };
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Admin logado pedindo o relatório para si.
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) {
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: userRes } = await caller.auth.getUser();
    const user = userRes?.user;
    if (!user?.email) return json({ error: 'Não autenticado.' }, 401);
    const { data: profile } = await caller.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return json({ error: 'Acesso negado.' }, 403);
    let body: { mode?: string } = {};
    try { body = await req.json(); } catch { /* corpo vazio */ }
    if (body.mode !== 'digest_me') return json({ error: 'Modo inválido.' }, 400);
    return json(await runDigest({ email: user.email }));
  }

  const { hour, dow } = nowInSaoPaulo();
  const alerts = await runAlerts();
  const digest = isDigestTime(hour, dow) ? await runDigest() : null;
  return json({ hour, dow, alerts, digest });
});
