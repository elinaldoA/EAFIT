// Envia push manual (do backoffice) pra todos os usuários ou pra uma lista
// específica. Mesmo padrão de auth de admin-users/index.ts: cliente anon com
// o JWT do chamador pra identificar quem pediu, confirma profiles.is_admin
// antes de qualquer coisa, só então usa a service role pra agir.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

configureVapid();

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'Não autenticado.' }, 401);
  const callerId = userRes.user.id;

  const { data: profile, error: profileErr } = await callerClient
    .from('profiles')
    .select('is_admin')
    .eq('id', callerId)
    .single();
  if (profileErr || !profile?.is_admin) return json({ error: 'Acesso negado.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const { title, body: message, targetUserIds } = body as { title?: string; body?: string; targetUserIds?: string[] };
  if (!title || !message) return json({ error: 'Faltam "title" e "body".' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth');
  if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
    query = query.in('user_id', targetUserIds);
  }
  const { data: subs, error: subsErr } = await query;
  if (subsErr) return json({ error: subsErr.message }, 500);

  let sent = 0;
  for (const sub of subs || []) {
    const result = await sendWebPush(sub, { title, body: message });
    if (result === 'sent') sent++;
    else if (result === 'stale') await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  }

  await admin.from('admin_audit_log').insert({
    admin_id: callerId,
    target_user_id: null,
    action: 'broadcastPush',
    details: { title, body: message, targetCount: subs?.length || 0, sent },
  });

  return json({ ok: true, targetCount: subs?.length || 0, sent });
});
