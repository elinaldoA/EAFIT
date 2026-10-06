// Push para o personal quando o aluno responde a um recado. A resposta já foi
// gravada pelo RPC client_send_reply (feito pelo app antes desta chamada). O
// texto e o destinatário NÃO vêm do corpo da requisição: a função lê a última
// resposta que o próprio chamador gravou (nos últimos 2 minutos) e envia ao
// personal do vínculo ativo dele. Assim ninguém consegue disparar push com
// texto arbitrário nem para quem não é o seu personal.
//
// Com `appointment_id` no corpo, avisa o personal da resposta do aluno a uma
// aula (confirmou/recusou): a função confere no banco que a aula é do chamador,
// que ele respondeu há pouco e que o vínculo está ativo; texto e destino saem
// do banco, nunca do corpo.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { corsHeadersFor } from '../_shared/cors.ts';
import { previewText } from '../_shared/trainerPush.ts';
import { buildResponsePush } from '../_shared/appointmentReminders.ts';

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
  const caller = userRes.user;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const meta = (caller.user_metadata || {}) as Record<string, unknown>;
  const name = String(meta.nome || meta.apelido || (caller.email || '').split('@')[0] || 'Seu aluno').slice(0, 40);

  async function pushToTrainer(trainerId: string, payload: { title: string; body: string; tag: string }) {
    const { data: subs, error: subsErr } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', trainerId);
    if (subsErr) return json({ error: subsErr.message }, 500);
    let sent = 0;
    for (const sub of subs || []) {
      const result = await sendWebPush(sub, payload);
      if (result === 'sent') sent++;
      else if (result === 'stale') await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
    return json({ sent });
  }

  let payload: { appointment_id?: unknown } = {};
  try { payload = await req.json(); } catch { /* corpo vazio: fluxo de resposta a recado */ }

  if (typeof payload.appointment_id === 'string') {
    const { data: appt } = await admin
      .from('trainer_appointments')
      .select('trainer_id, starts_at, status, responded_at')
      .eq('id', payload.appointment_id)
      .eq('client_id', caller.id)
      .maybeSingle();
    if (!appt || !['confirmed', 'declined'].includes(appt.status)) return json({ sent: 0 });
    if (!appt.responded_at || Date.now() - new Date(appt.responded_at).getTime() > 2 * 60_000) return json({ sent: 0 });

    const { data: apptLink } = await admin
      .from('trainer_clients')
      .select('trainer_id')
      .eq('client_id', caller.id)
      .eq('trainer_id', appt.trainer_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!apptLink) return json({ sent: 0 });

    const push = buildResponsePush(appt.status as 'confirmed' | 'declined', name, appt.starts_at);
    return await pushToTrainer(appt.trainer_id, { ...push, tag: `appt-response-${payload.appointment_id}` });
  }

  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: reply } = await admin
    .from('trainer_messages')
    .select('trainer_id, body')
    .eq('client_id', caller.id)
    .eq('sender', 'client')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!reply) return json({ sent: 0 });

  const { data: link } = await admin
    .from('trainer_clients')
    .select('trainer_id')
    .eq('client_id', caller.id)
    .eq('trainer_id', reply.trainer_id)
    .eq('status', 'active')
    .maybeSingle();
  if (!link) return json({ sent: 0 });

  return await pushToTrainer(link.trainer_id, {
    title: `Resposta de ${name}`,
    body: previewText(String(reply.body)),
    tag: `trainer-reply-${caller.id}`,
  });
});
