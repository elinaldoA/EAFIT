// Descadastro dos e-mails de resumo, reengajamento e comunicados. Roda sem
// login (Verify JWT desligado): quem autoriza é o código assinado que vai em
// cada e-mail (ver _shared/emailPrefs.ts), válido só pra conta que o recebeu.
// Grava user_metadata.notifyEmail = false — a mesma chave do Perfil, onde a
// pessoa pode ligar de novo.
//
// Chamado de dois jeitos:
//   * pelo app, ao abrir o link do rodapé (POST com { token } no corpo);
//   * pelo botão de descadastro do cliente de e-mail (POST com ?t= na URL,
//     cabeçalho List-Unsubscribe). Um GET no mesmo endereço leva pro app.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { APP_URL } from '../_shared/emailLayout.ts';
import { verifyUnsubscribeToken } from '../_shared/emailPrefs.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const fromUrl = new URL(req.url).searchParams.get('t');
  if (req.method === 'GET') {
    return Response.redirect(`${APP_URL}?descadastro=${encodeURIComponent(fromUrl || '')}`, 302);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let token: unknown = fromUrl;
  if (!token) {
    try { token = (await req.json())?.token; } catch { /* sem corpo JSON: fica sem código */ }
  }

  const userId = await verifyUnsubscribeToken(token, SERVICE_ROLE_KEY);
  if (!userId) return json({ error: 'Link inválido.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: { notifyEmail: false } });
  // Conta que não existe mais: não há o que descadastrar, e pra quem clicou dá no mesmo.
  if (error && error.status !== 404) {
    console.error('email-unsubscribe error:', error.message);
    return json({ error: 'Não foi possível concluir agora.' }, 500);
  }
  return json({ ok: true });
});
