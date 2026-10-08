// Apaga de fato todos os dados do usuário autenticado e a própria conta de
// login. Roda com o JWT do usuário (verify_jwt padrão do Supabase) só para
// identificar quem está chamando; as exclusões em si usam a service role
// porque tabelas filhas (exercise_sets, plan_days, plan_exercises) não têm
// user_id direto e dependem de deletar via os ids do pai.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { deleteUserData } from '../_shared/deleteUserData.ts';
import { countWorkouts, logAccountDeletion } from '../_shared/accountDeletion.ts';
import { sendEmail } from '../_shared/email.ts';
import { renderEmail } from '../_shared/emailLayout.ts';
import { accountDeletedEmail } from '../_shared/emailTexts.ts';
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

  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return json({ error: 'Não autenticado.' }, 401);
  }
  const userId = userRes.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const workouts = await countWorkouts(admin, userId);
    await deleteUserData(admin, userId);

    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;

    await logAccountDeletion(admin, 'self', userRes.user.created_at, workouts);
    // Confirmação por e-mail (melhor esforço): o endereço vem da sessão de quem
    // pediu, lido antes da exclusão; falha aqui não desfaz nada.
    if (userRes.user.email) {
      const lang = langOf(userRes.user.user_metadata);
      await sendEmail(userRes.user.email, renderEmail(lang, accountDeletedEmail(lang)));
    }
    return json({ ok: true });
  } catch (err) {
    console.error('delete-account error:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
