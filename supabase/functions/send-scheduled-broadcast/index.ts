// Edge Function chamada pelo cron (a cada minuto) pra disparar as
// notificações agendadas em public.scheduled_broadcasts (ver "Agendar" em
// app-admin/src/pages/Broadcast.jsx). Mesmo padrão de send-reminders: sem
// usuário logado, Verify JWT desativado, age via service role.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

configureVapid();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async () => {
  const { data: due, error: dueErr } = await supabase
    .from('scheduled_broadcasts')
    .select('id, title, body, target_user_ids, created_by')
    .is('sent_at', null)
    .lte('scheduled_at', new Date().toISOString());
  if (dueErr) return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 });
  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  for (const broadcast of due) {
    let query = supabase.from('push_subscriptions').select('endpoint, p256dh, auth');
    if (Array.isArray(broadcast.target_user_ids) && broadcast.target_user_ids.length > 0) {
      query = query.in('user_id', broadcast.target_user_ids);
    }
    const { data: subs, error: subsErr } = await query;
    if (subsErr) {
      console.error('scheduled_broadcasts subs error:', subsErr.message);
      continue;
    }

    let sent = 0;
    for (const sub of subs || []) {
      const result = await sendWebPush(sub, { title: broadcast.title, body: broadcast.body });
      if (result === 'sent') sent++;
      else if (result === 'stale') await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }

    // Marca sent_at antes de qualquer coisa poder falhar de novo nele: uma
    // vez processado (mesmo com erro parcial de envio), não deve ser
    // reprocessado no próximo minuto.
    await supabase.from('scheduled_broadcasts')
      .update({ sent_at: new Date().toISOString(), sent_count: sent, target_count: subs?.length || 0 })
      .eq('id', broadcast.id);

    await supabase.from('admin_audit_log').insert({
      admin_id: broadcast.created_by,
      target_user_id: null,
      action: 'broadcastPush',
      details: { title: broadcast.title, body: broadcast.body, targetCount: subs?.length || 0, sent, scheduled: true },
    });
  }

  return new Response(JSON.stringify({ processed: due.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
