// Edge Function chamada de 5 em 5 minutos pelo pg_cron: entrega os recados que
// o personal agendou. Mesmo padrão de send-trainer-alerts: sem usuário logado,
// Verify JWT desativado, age via service role e só aceita x-cron-secret.
//
// Quem recebe é decidido no banco por trainer_dispatch_scheduled(), que já
// grava os recados em trainer_messages e marca o agendamento como enviado;
// aqui só sai o push para esses alunos. Se o push falhar, o recado já está no
// app do aluno, como num envio normal.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { loadLangs } from '../_shared/lang.ts';
import { defaultMessageTitle, previewText } from '../_shared/trainerPush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Dispatched = { sd_id: string; sd_trainer: string; sd_body: string; sd_clients: string[] };
type Sub = { user_id: string; endpoint: string; p256dh: string; auth: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabase.rpc('trainer_dispatch_scheduled');
  if (error) {
    console.error('trainer_dispatch_scheduled error:', error.message);
    return json({ error: error.message }, 500);
  }

  const rows = (data || []) as Dispatched[];
  if (!rows.length) return json({ dispatched: 0, pushed: 0 });

  const clientIds = [...new Set(rows.flatMap((r) => r.sd_clients))];
  const { data: subsData, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', clientIds);
  if (subsErr) console.error('push_subscriptions error:', subsErr.message);

  const subsByUser = new Map<string, Sub[]>();
  for (const s of (subsData || []) as Sub[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }
  const langs = await loadLangs(supabase, clientIds);

  let pushed = 0;
  for (const r of rows) {
    for (const clientId of r.sd_clients) {
      const title = defaultMessageTitle(langs.get(clientId) ?? 'pt');
      for (const sub of subsByUser.get(clientId) || []) {
        const result = await sendWebPush(sub, { title, body: previewText(r.sd_body), tag: 'trainer-message' });
        if (result === 'sent') pushed++;
        else if (result === 'stale') await supabase.rpc('push_drop_stale', { p_endpoints: [sub.endpoint] });
      }
    }
  }

  return json({ dispatched: rows.length, pushed });
});
