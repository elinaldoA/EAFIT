// Conecta as redes da EAFIT ao painel (Marketing → Contas) por OAuth.
//
//   POST { provider: 'meta' | 'threads' } (admin logado, área 'marketing')
//        → { url } da tela de login da Meta/Threads, com state assinado.
//   GET  ?code=…&state=… (retorno da Meta/Threads)
//        → troca o código por token de longa duração, salva as contas e
//          redireciona de volta para o painel (#/marketing-contas).
//
// Verify JWT desligado: o retorno do OAuth chega sem sessão; quem autoriza é
// o state assinado (admin, validade de 10 min). O POST confere o JWT aqui.
//
// Configuração (uma vez):
//   1. developers.facebook.com → Criar app (tipo Empresa) com os casos de uso
//      "Gerenciar tudo na sua Página", "Gerenciar mensagens e conteúdo no
//      Instagram" e "Acessar a API do Threads". Quem conecta precisa ter papel
//      no app (Administrador/Desenvolvedor): assim o acesso padrão basta.
//   2. URI de redirecionamento válida (Login do Facebook e Threads):
//      https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/marketing-oauth
//   3. Secrets: META_APP_ID, META_APP_SECRET (Configurações → Básico),
//      THREADS_APP_ID, THREADS_APP_SECRET (caso de uso Threads → Configurações)
//      e, se o app tiver "Login do Facebook para Empresas", META_LOGIN_CONFIG_ID
//      e MARKETING_TOKEN_KEY (openssl rand -base64 32; não trocar depois, ou
//      os tokens salvos deixam de abrir e é preciso reconectar).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import {
  encryptToken, GRAPH_BASE, GRAPH_VERSION, makeApi, META_SCOPES, type OAuthState, request, signState, THREADS_BASE,
  THREADS_SCOPES, verifyState,
} from '../_shared/marketing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN_KEY = Deno.env.get('MARKETING_TOKEN_KEY') || '';
const META_APP_ID = Deno.env.get('META_APP_ID') || '';
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') || '';
// App de Empresa com "Login do Facebook para Empresas": a Meta recusa `scope`
// e pede o ID de uma configuração (Login do Facebook para Empresas →
// Configurações) com as mesmas permissões de META_SCOPES.
const META_LOGIN_CONFIG_ID = Deno.env.get('META_LOGIN_CONFIG_ID') || '';
const THREADS_APP_ID = Deno.env.get('THREADS_APP_ID') || '';
const THREADS_APP_SECRET = Deno.env.get('THREADS_APP_SECRET') || '';

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/marketing-oauth`;
// Para onde o retorno pode mandar o admin de volta (o painel fica em /admin/).
const ADMIN_ORIGINS = ['https://eafit.com.br', 'http://localhost:5174'];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function back(origin: string, params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return new Response(null, { status: 302, headers: { Location: `${origin}/admin/#/marketing-contas?${q}` } });
}

type SavedAccount = {
  platform: 'facebook' | 'instagram' | 'threads'; external_id: string; name: string; username?: string | null;
  picture_url?: string | null; parent_id?: string | null; token_expires_at?: string | null;
};

async function saveAccount(account: SavedAccount, token: string, adminId: string): Promise<string> {
  const { data, error } = await admin.from('marketing_accounts').upsert({
    ...account, status: 'ok', status_detail: null, connected_by: adminId, connected_at: new Date().toISOString(),
  }, { onConflict: 'platform,external_id' }).select('id').single();
  if (error) throw error;
  const { error: tokErr } = await admin.from('marketing_tokens').upsert({
    account_id: data.id, token_enc: await encryptToken(TOKEN_KEY, token), updated_at: new Date().toISOString(),
  });
  if (tokErr) throw tokErr;
  return data.id as string;
}

// Páginas que a pessoa administra + o Instagram profissional ligado a cada
// uma. Token de Página tirado de um token de usuário de longa duração não expira.
async function connectMeta(code: string, adminId: string): Promise<string[]> {
  const short = await request(fetch, `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: REDIRECT_URI, code,
  })}`);
  // Com configuração de token de usuário do sistema (Login para Empresas) o
  // token já não expira e a troca pode ser recusada: segue com o que veio.
  let userToken = String(short.access_token);
  try {
    const long = await request(fetch, `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: META_APP_ID, client_secret: META_APP_SECRET, fb_exchange_token: userToken,
    })}`);
    if (long.access_token) userToken = String(long.access_token);
  } catch (err) {
    console.warn('marketing-oauth: troca por token longo recusada, usando o original:', err);
  }
  const pages = await makeApi(fetch, GRAPH_BASE, userToken).get('/me/accounts', {
    fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
    limit: 100,
  });
  const names: string[] = [];
  for (const p of (pages.data as Record<string, any>[]) || []) {
    const pageId = await saveAccount({
      platform: 'facebook', external_id: String(p.id), name: String(p.name || ''), picture_url: p.picture?.data?.url || null,
    }, String(p.access_token), adminId);
    names.push(`Facebook: ${p.name}`);
    const ig = p.instagram_business_account;
    if (ig?.id) {
      await saveAccount({
        platform: 'instagram', external_id: String(ig.id), name: String(ig.name || ig.username || ''), username: ig.username || null,
        picture_url: ig.profile_picture_url || null, parent_id: pageId,
      }, String(p.access_token), adminId);
      names.push(`Instagram: @${ig.username}`);
    }
  }
  return names;
}

async function connectThreads(code: string, adminId: string): Promise<string[]> {
  const short = await request(fetch, 'https://graph.threads.net/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: THREADS_APP_ID, client_secret: THREADS_APP_SECRET, grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI, code,
    }),
  });
  const long = await request(fetch, `https://graph.threads.net/access_token?${new URLSearchParams({
    grant_type: 'th_exchange_token', client_secret: THREADS_APP_SECRET, access_token: String(short.access_token),
  })}`);
  const token = String(long.access_token);
  const me = await makeApi(fetch, THREADS_BASE, token).get('/me', { fields: 'id,username,name,threads_profile_picture_url' });
  await saveAccount({
    platform: 'threads', external_id: String(me.id), name: String(me.name || me.username || ''), username: String(me.username || ''),
    picture_url: (me.threads_profile_picture_url as string) || null,
    token_expires_at: new Date(Date.now() + Number(long.expires_in || 5_184_000) * 1000).toISOString(),
  }, token, adminId);
  return [`Threads: @${me.username}`];
}

async function handleCallback(url: URL): Promise<Response> {
  // A Meta devolve erros de configuração (ex.: domínio do app) com error_code
  // e sem state: volta para o painel de produção mostrando o motivo.
  const metaError = url.searchParams.get('error_description') || url.searchParams.get('error_message');
  const state = await verifyState(TOKEN_KEY, url.searchParams.get('state') || '');
  if (!state || !ADMIN_ORIGINS.includes(state.origin)) {
    if (metaError || url.searchParams.get('error_code')) return back(ADMIN_ORIGINS[0], { erro: metaError || 'A Meta recusou a conexão.' });
    return new Response('Link de conexão inválido ou vencido.', { status: 400 });
  }
  if (url.searchParams.get('error') || metaError) {
    return back(state.origin, { erro: metaError || 'Conexão cancelada.' });
  }
  // O Threads devolve o código com "#_" no fim.
  const code = (url.searchParams.get('code') || '').replace(/#_$/, '');
  if (!code) return back(state.origin, { erro: 'A rede não devolveu o código de acesso.' });
  try {
    const names = state.provider === 'meta' ? await connectMeta(code, state.admin) : await connectThreads(code, state.admin);
    await admin.from('admin_audit_log').insert({
      admin_id: state.admin, target_user_id: null, action: 'marketingConnect', details: { provider: state.provider, accounts: names },
    });
    if (!names.length) return back(state.origin, { erro: 'Nenhuma Página encontrada: confira se você é admin da Página e marcou ela no login.' });
    return back(state.origin, { conectado: names.join(' · ') });
  } catch (err) {
    console.error('marketing-oauth:', err);
    return back(state.origin, { erro: err instanceof Error ? err.message : 'Falha ao conectar.' });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') return handleCallback(url);

  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userRes } = await callerClient.auth.getUser();
  if (!userRes?.user) return json({ error: 'Não autenticado.' }, 401);
  const { data: can } = await callerClient.rpc('admin_can', { area: 'marketing' });
  if (can !== true) return json({ error: 'Seu perfil não tem a área Marketing.' }, 403);

  const origin = req.headers.get('origin') || '';
  if (!ADMIN_ORIGINS.includes(origin)) return json({ error: 'Origem não permitida.' }, 400);
  const { provider } = await req.json().catch(() => ({})) as { provider?: string };
  if (provider !== 'meta' && provider !== 'threads') return json({ error: 'Rede inválida.' }, 400);

  const missing = [
    !TOKEN_KEY && 'MARKETING_TOKEN_KEY',
    provider === 'meta' && !META_APP_ID && 'META_APP_ID',
    provider === 'meta' && !META_APP_SECRET && 'META_APP_SECRET',
    provider === 'threads' && !THREADS_APP_ID && 'THREADS_APP_ID',
    provider === 'threads' && !THREADS_APP_SECRET && 'THREADS_APP_SECRET',
  ].filter(Boolean);
  if (missing.length) return json({ error: `Falta configurar nas Edge Functions: ${missing.join(', ')}.`, missing }, 503);

  const state: OAuthState = { admin: userRes.user.id, provider, origin, exp: Date.now() + 10 * 60_000 };
  const signed = await signState(TOKEN_KEY, state);
  const loginUrl = provider === 'meta'
    ? `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${new URLSearchParams({
      client_id: META_APP_ID, redirect_uri: REDIRECT_URI, state: signed, response_type: 'code',
      ...(META_LOGIN_CONFIG_ID ? { config_id: META_LOGIN_CONFIG_ID } : { scope: META_SCOPES.join(',') }),
    })}`
    : `https://threads.net/oauth/authorize?${new URLSearchParams({
      client_id: THREADS_APP_ID, redirect_uri: REDIRECT_URI, state: signed, response_type: 'code', scope: THREADS_SCOPES.join(','),
    })}`;
  return json({ url: loginUrl });
});
