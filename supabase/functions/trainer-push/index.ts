// Push de um recado do personal para os alunos. O recado em si já foi gravado
// pelo RPC trainer_send_message (feito pelo app antes desta chamada); aqui só
// sai a notificação. Mesmo padrão de auth de admin-broadcast: o JWT identifica
// quem chama, e a função NUNCA confia na lista de destinatários do corpo —
// cruza com trainer_clients (vínculo ativo do chamador) antes de enviar.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { corsHeadersFor } from '../_shared/cors.ts';
import { defaultMessageTitle, MAX_BODY, pickRecipients, previewText } from '../_shared/trainerPush.ts';
import { loadLangs } from '../_shared/lang.ts';

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

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userRes, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'Não autenticado.' }, 401);
  const callerId = userRes.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: trainer } = await admin.from('trainers').select('user_id').eq('user_id', callerId).maybeSingle();
  if (!trainer) return json({ error: 'Acesso negado.' }, 403);

  let payload: { client_ids?: unknown; body?: unknown; title?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  const text = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!text || text.length > MAX_BODY) return json({ error: 'Mensagem inválida.' }, 400);
  const customTitle = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim().slice(0, 60) : null;

  const { data: links, error: linksErr } = await admin
    .from('trainer_clients')
    .select('client_id')
    .eq('trainer_id', callerId)
    .eq('status', 'active');
  if (linksErr) return json({ error: linksErr.message }, 500);

  const recipients = pickRecipients(payload.client_ids, (links || []).map((l) => l.client_id as string));
  if (recipients.length === 0) return json({ sent: 0 });

  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', recipients);
  if (subsErr) return json({ error: subsErr.message }, 500);

  // título padrão no idioma de cada aluno (título digitado pelo personal vale pra todos)
  const langs = customTitle ? new Map() : await loadLangs(admin, recipients);

  let sent = 0;
  for (const sub of subs || []) {
    const title = customTitle ?? defaultMessageTitle(langs.get(sub.user_id) ?? 'pt');
    const result = await sendWebPush(sub, { title, body: previewText(text), tag: 'trainer-message' });
    if (result === 'sent') sent++;
    else if (result === 'stale') await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  }

  return json({ sent, recipients: recipients.length });
});
