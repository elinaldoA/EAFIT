// Resposta da pesquisa de inatividade ("por que você parou?") do e-mail
// semanal. Roda sem login (Verify JWT desligado): quem autoriza é o código
// assinado que vai em cada link do e-mail (ver _shared/inactivity.ts), válido
// só pra conta que o recebeu.
//
// Chamada pelo app ao abrir o link (POST com { token, reason, comment? }): o
// e-mail aponta pro app, e não direto pra cá, pra que o antivírus do provedor
// de e-mail, que visita os links, não grave resposta no lugar da pessoa.
// Grava na pesquisa mais recente enviada à conta; responder de novo (outro
// motivo, ou o comentário depois do toque) atualiza a mesma linha.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { cleanComment, isInactivityReason, verifySurveyToken } from '../_shared/inactivity.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { token?: unknown; reason?: unknown; comment?: unknown } = {};
  try { body = (await req.json()) ?? {}; } catch { /* sem corpo JSON: fica sem código */ }

  const userId = await verifySurveyToken(body.token, SERVICE_ROLE_KEY);
  if (!userId) return json({ error: 'Link inválido.' }, 400);
  if (!isInactivityReason(body.reason)) return json({ error: 'Motivo inválido.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: survey, error: findErr } = await admin
    .from('inactivity_surveys')
    .select('id')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) {
    console.error('inactivity-reason find error:', findErr.message);
    return json({ error: 'Não foi possível concluir agora.' }, 500);
  }
  // Conta excluída depois do envio: não há onde gravar, e pra quem clicou dá no mesmo.
  if (!survey) return json({ ok: true });

  const { error } = await admin
    .from('inactivity_surveys')
    .update({ reason: body.reason, comment: cleanComment(body.comment), answered_at: new Date().toISOString() })
    .eq('id', survey.id);
  if (error) {
    console.error('inactivity-reason update error:', error.message);
    return json({ error: 'Não foi possível concluir agora.' }, 500);
  }
  return json({ ok: true });
});
