// Edge Function de push imediato, chamada pelo próprio app (client) logo após um
// evento acontecer (novo PR, conquista desbloqueada) — ao contrário de send-reminders
// (chamada só pelo cron, sem usuário logado), esta precisa de autenticação: o usuário
// só pode mandar push pra si mesmo, nunca pra outro. Por isso Verify JWT fica LIGADO
// no dashboard e o user_id vem do token, nunca do body da requisição.
//
// CORS: o app chama via supabase-js (functions.invoke), então o navegador manda um
// preflight OPTIONS antes do POST — sem respondê-lo (e sem Access-Control-Allow-Origin
// na resposta) o envio era bloqueado pelo navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Limites do texto: o conteúdo é escolhido pelo cliente (só chega ao próprio
// aparelho do usuário, mas não há motivo para aceitar payload arbitrário).
const MAX_TITLE = 80;
const MAX_BODY = 200;
const MAX_TAG = 64;

configureVapid();

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

  // Cliente com o token do próprio usuário (não a service role) só pra validar quem
  // está chamando — getUser() verifica a assinatura/expiração do JWT contra o Auth.
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
  if (authErr || !user) return json({ error: 'Não autenticado.' }, 401);

  const payload = await req.json().catch(() => ({}));
  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, MAX_TITLE) : '';
  const body = typeof payload?.body === 'string' ? payload.body.trim().slice(0, MAX_BODY) : '';
  const tag = typeof payload?.tag === 'string' ? payload.tag.slice(0, MAX_TAG) : undefined;
  if (!title || !body) return json({ error: 'title e body são obrigatórios' }, 400);

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user.id);
  if (subsErr) return json({ error: subsErr.message }, 500);

  // Em paralelo: um aparelho lento não atrasa os outros do mesmo usuário.
  const results = await Promise.all((subs || []).map(async (sub) => ({
    sub,
    result: await sendWebPush(sub, { title, body, tag }),
  })));

  const stale = results.filter(r => r.result === 'stale').map(r => r.sub.endpoint);
  if (stale.length) await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', stale);

  return json({ sent: results.filter(r => r.result === 'sent').length });
});
