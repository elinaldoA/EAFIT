// Envia push manual (do backoffice) pra todos os usuários ou pra uma lista
// específica. Mesmo padrão de auth de admin-users/index.ts: cliente anon com
// o JWT do chamador pra identificar quem pediu, confirma profiles.is_admin
// antes de qualquer coisa, só então usa a service role pra agir.
//
// Com `email` no corpo, manda também por e-mail:
//   'aviso'    comunicado — só pra quem não se descadastrou (Perfil ou link do
//              rodapé), com e-mail confirmado e conta ativa; no envio "para
//              todos" os admins ficam de fora;
//   'resposta' resposta a um feedback da própria pessoa — vai sempre, por ser
//              continuação de uma conversa que ela começou.
//
// Com `audience: 'influenciadores'` ou `'embaixadores'` (Pessoas → Embaixadores
// e influenciadores) é um recado da equipe para esse grupo (só os ativos): a
// lista sai do banco, nunca do corpo; fica em user_notifications com kind
// 'influenciador' ou 'embaixador' (aba Recados do modo do programa,
// app-react/src/program/) e o push abre essa aba. Sem e-mail.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configureVapid, sendWebPush } from '../_shared/webpush.ts';
import { corsHeadersFor } from '../_shared/cors.ts';
import { listAllUserIds, saveInbox } from '../_shared/inbox.ts';
import { sendEmailBatch } from '../_shared/email.ts';
import { renderEmail } from '../_shared/emailLayout.ts';
import { type BulkEmailItem, bulkEmailItem, loadEmailUsers } from '../_shared/emailRecipients.ts';
import { broadcastEmail, feedbackReplyEmail } from '../_shared/emailTexts.ts';
import { langOf } from '../_shared/lang.ts';
import { canReceiveBulkEmail, MAX_BULK_EMAILS } from '../_shared/weeklyEmails.ts';

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

  const { title, body: message, email, audience } = body as {
    title?: string; body?: string; targetUserIds?: string[]; email?: 'aviso' | 'resposta'; audience?: string;
  };
  let { targetUserIds } = body as { targetUserIds?: string[] };
  if (!title || !message) return json({ error: 'Faltam "title" e "body".' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const AUDIENCES: Record<string, string> = { influenciadores: 'influenciador', embaixadores: 'embaixador' };
  const programKind = audience === undefined ? null : AUDIENCES[audience] ?? '';
  if (programKind === '') return json({ error: 'Público inválido.' }, 400);
  const toProgram = programKind !== null;
  if (toProgram) {
    const { data: members, error: membersErr } = await admin
      .from('ambassadors')
      .select('user_id')
      .eq('kind', programKind)
      .eq('active', true)
      .not('user_id', 'is', null);
    if (membersErr) return json({ error: membersErr.message }, 500);
    targetUserIds = (members || []).map((r) => r.user_id as string);
    if (!targetUserIds.length) {
      return json({ error: programKind === 'embaixador' ? 'Nenhum embaixador ativo.' : 'Nenhum influenciador ativo.' }, 400);
    }
  }

  let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth');
  if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
    query = query.in('user_id', targetUserIds);
  }
  const { data: subs, error: subsErr } = await query;
  if (subsErr) return json({ error: subsErr.message }, 500);

  let sent = 0;
  for (const sub of subs || []) {
    const result = await sendWebPush(sub, toProgram ? { title, body: message, tag: 'program-message' } : { title, body: message });
    if (result === 'sent') sent++;
    else if (result === 'stale') await admin.rpc('push_drop_stale', { p_endpoints: [sub.endpoint] });
  }

  const targeted = Array.isArray(targetUserIds) && targetUserIds.length > 0;
  const inboxIds = targeted ? targetUserIds : await listAllUserIds(admin);
  await saveInbox(admin, inboxIds!, { kind: programKind ?? 'aviso', title, body: message });

  let emailTargetCount: number | undefined;
  let emailSent: number | undefined;
  if (!toProgram && (email === 'aviso' || email === 'resposta')) {
    const users = await loadEmailUsers(admin, targeted ? targetUserIds : undefined);
    let items: BulkEmailItem[];
    if (email === 'resposta') {
      items = users.filter((u) => u.email).map((u) => {
        const lang = langOf(u.meta);
        return { to: u.email!, email: renderEmail(lang, feedbackReplyEmail(lang, message)), options: {} };
      });
    } else {
      let recipients = users.filter((u) => canReceiveBulkEmail(u));
      if (!targeted) {
        const { data: admins } = await admin.from('profiles').select('id').eq('is_admin', true);
        const adminIds = new Set((admins || []).map((a) => a.id as string));
        recipients = recipients.filter((u) => !adminIds.has(u.id));
      }
      const env = { supabaseUrl: SUPABASE_URL, secret: SERVICE_ROLE_KEY };
      items = await Promise.all(recipients.map((u) => bulkEmailItem(u, (lang) => broadcastEmail(lang, title, message), env)));
    }
    // Teto diário do Gmail: o que passar disso não é enviado (o admin vê a diferença nos números).
    emailTargetCount = items.length;
    emailSent = await sendEmailBatch(items.slice(0, MAX_BULK_EMAILS));
  }

  await admin.from('admin_audit_log').insert({
    admin_id: callerId,
    target_user_id: null,
    action: 'broadcastPush',
    details: {
      title, body: message, targetCount: subs?.length || 0, sent, emailTargetCount, emailSent,
      ...(toProgram ? { audience, recipients: targetUserIds!.length } : {}),
    },
  });

  return json({
    ok: true, targetCount: subs?.length || 0, sent, emailTargetCount, emailSent,
    ...(toProgram ? { recipients: targetUserIds!.length } : {}),
  });
});
