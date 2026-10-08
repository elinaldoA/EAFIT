// E-mail de boas-vindas, chamado pelo app logo depois do cadastro. Roda com o
// JWT do usuário e não aceita nada no corpo: o destinatário é sempre o e-mail
// da própria conta, só pra conta recém-criada e uma vez só (marcado em
// app_metadata.welcome_email_at, que o usuário não consegue alterar). Assim
// ninguém usa a função pra mandar e-mail pra terceiros nem em repetição.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';
import { renderEmail } from '../_shared/emailLayout.ts';
import { shouldSendWelcome, welcomeEmail } from '../_shared/emailTexts.ts';
import { langOf } from '../_shared/lang.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  const user = userRes.user;

  if (!user.email || !shouldSendWelcome(user)) return json({ sent: false });

  const lang = langOf(user.user_metadata);
  const result = await sendEmail(user.email, renderEmail(lang, welcomeEmail(lang)));
  // Só marca quando saiu de verdade: sem os secrets do Gmail ('skipped') ou
  // com falha no envio, a próxima chamada tenta de novo.
  if (result !== 'sent') return json({ sent: false });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: markErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { welcome_email_at: new Date().toISOString() },
  });
  if (markErr) console.error('send-welcome mark error:', markErr.message);
  return json({ sent: true });
});
