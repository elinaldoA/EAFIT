// Marketing (painel → Marketing): publica nas redes conectadas, traz os
// comentários e responde. Duas portas:
//
//   cron (header x-cron-secret, ver 20261222010000_marketing.sql)
//     { job: 'publish' }  alvos vencidos da fila (agendados e containers em processamento)
//     { job: 'sync' }     comentários de todas as contas
//     { job: 'refresh' }  renova token do Threads perto de vencer
//   admin logado com a área 'marketing'
//     { action: 'run', postId }                 publica já (o painel chama logo após criar o post)
//     { action: 'sync' }                        atualiza comentários agora
//     { action: 'reply', commentId, text }      responde um comentário
//     { action: 'hide', commentId, hidden }     oculta/mostra um comentário
//     { action: 'delete', postId }              apaga o post nas redes e, dando tudo certo, do painel
//
// Verify JWT desligado por causa do cron; o admin é conferido aqui (JWT + admin_can).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { CRON_SECRET_HEADER, isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import {
  type Account, baseFor, checkPost, continuePublish, decryptToken, deletePublished, encryptToken, fetchComments, GraphError, makeApi,
  type Media, type Post, replyToComment, request, setCommentHidden, startPublish, type Step,
} from '../_shared/marketing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const TOKEN_KEY = Deno.env.get('MARKETING_TOKEN_KEY') || '';

// ~30 min de espera (a cada 30 s) para a rede processar um vídeo.
const MAX_ATTEMPTS = 60;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type AccountRow = Account & { status: string; token_expires_at: string | null };
type Loaded = { account: AccountRow; token: string };

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

async function loadAccount(id: string): Promise<Loaded> {
  const { data, error } = await db.from('marketing_accounts')
    .select('id, platform, external_id, username, status, token_expires_at, marketing_tokens(token_enc)')
    .eq('id', id).single();
  if (error || !data) throw new Error('Conta não encontrada (foi desconectada?).');
  const tok = data.marketing_tokens as unknown as { token_enc: string } | { token_enc: string }[] | null;
  const enc = Array.isArray(tok) ? tok[0]?.token_enc : tok?.token_enc;
  if (!enc) throw new Error('Conta sem token: reconecte em Marketing → Contas.');
  return { account: data as unknown as AccountRow, token: await decryptToken(TOKEN_KEY, enc) };
}

async function markReconnect(accountId: string, detail: string) {
  await db.from('marketing_accounts').update({ status: 'reconnect', status_detail: detail.slice(0, 300) }).eq('id', accountId);
}

// Guarda o erro e, se for token inválido, já marca a conta para reconectar.
async function handleGraphError(accountId: string, err: unknown) {
  if (err instanceof GraphError && err.needsReconnect) await markReconnect(accountId, err.message);
}

// ---------- publicação ----------

type TargetRow = { id: string; post_id: string; account_id: string; status: string; container_id: string | null; attempts: number };

async function processTarget(t: TargetRow, posts: Map<string, Post>): Promise<{ id: string; status: string; error?: string }> {
  const finish = async (patch: Record<string, unknown>) => {
    await db.from('marketing_post_targets').update({ ...patch, locked_until: null, updated_at: new Date().toISOString() }).eq('id', t.id);
    return { id: t.id, status: String(patch.status || t.status), error: patch.error as string | undefined };
  };

  let post = posts.get(t.post_id);
  if (!post) {
    const { data } = await db.from('marketing_posts').select('id, caption, media').eq('id', t.post_id).single();
    if (!data) return finish({ status: 'failed', error: 'Post apagado.' });
    post = { id: data.id, caption: data.caption || '', media: (data.media || []) as Media[] };
    posts.set(t.post_id, post);
  }

  let loaded: Loaded;
  try {
    loaded = await loadAccount(t.account_id);
  } catch (err) {
    return finish({ status: 'failed', error: errMsg(err) });
  }
  const { account, token } = loaded;
  if (account.status !== 'ok') return finish({ status: 'failed', error: 'Conta precisa ser reconectada (Marketing → Contas).' });
  const invalid = checkPost(account.platform, post);
  if (invalid) return finish({ status: 'failed', error: invalid });
  if (t.attempts > MAX_ATTEMPTS) return finish({ status: 'failed', error: 'A rede demorou demais para processar a mídia. Tente de novo.' });

  try {
    const api = makeApi(fetch, baseFor(account.platform), token);
    const step: Step = t.container_id
      ? await continuePublish(api, account, post, t.container_id)
      : await startPublish(api, account, post);
    if (step.state === 'processing') {
      return finish({
        status: 'processing', container_id: step.containerId,
        run_after: new Date(Date.now() + step.retryInSec * 1000).toISOString(),
      });
    }
    return finish({
      status: 'published', external_id: step.externalId, permalink: step.permalink, error: null,
      published_at: new Date().toISOString(),
    });
  } catch (err) {
    await handleGraphError(account.id, err);
    return finish({ status: 'failed', error: errMsg(err) });
  }
}

async function runQueue(postId: string | null) {
  const { data, error } = await db.rpc('marketing_claim_targets', { p_post: postId, p_limit: 20 });
  if (error) throw error;
  const posts = new Map<string, Post>();
  const results = [];
  for (const t of (data || []) as TargetRow[]) results.push(await processTarget(t, posts));
  return results;
}

// ---------- exclusão ----------

type DeleteResult = { target: string; ok: boolean; error?: string };

// Apaga onde já saiu, descarta o que ainda está na fila e só remove o post do
// painel quando nada falhou; o que falhar fica no painel com o motivo.
async function deletePost(postId: string): Promise<{ removed: boolean; results: DeleteResult[] }> {
  const { data: targets, error } = await db.from('marketing_post_targets')
    .select('id, account_id, status, external_id, locked_until').eq('post_id', postId);
  if (error) throw error;
  if ((targets || []).some((t) => t.locked_until && new Date(t.locked_until) > new Date())) {
    throw new Error('Este post está sendo publicado agora. Tente de novo em instantes.');
  }

  const results: DeleteResult[] = [];
  for (const t of targets || []) {
    if (t.status !== 'published' || !t.external_id) {
      await db.from('marketing_post_targets').delete().eq('id', t.id);
      results.push({ target: t.id, ok: true });
      continue;
    }
    try {
      const { account, token } = await loadAccount(t.account_id);
      await deletePublished(makeApi(fetch, baseFor(account.platform), token), t.external_id);
      await db.from('marketing_comments').delete().eq('account_id', t.account_id).eq('post_external_id', t.external_id);
      await db.from('marketing_post_targets').delete().eq('id', t.id);
      results.push({ target: t.id, ok: true });
    } catch (err) {
      await handleGraphError(t.account_id, err);
      const msg = `Não deu para excluir: ${errMsg(err)}`;
      await db.from('marketing_post_targets').update({ error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', t.id);
      results.push({ target: t.id, ok: false, error: msg });
    }
  }

  const removed = results.every((r) => r.ok);
  if (removed) await db.from('marketing_posts').delete().eq('id', postId);
  return { removed, results };
}

// ---------- comentários ----------

async function syncComments() {
  const { data: accounts } = await db.from('marketing_accounts').select('id').eq('status', 'ok');
  const out: { account: string; comments?: number; error?: string }[] = [];
  for (const { id } of accounts || []) {
    try {
      const { account, token } = await loadAccount(id);
      const rows = await fetchComments(makeApi(fetch, baseFor(account.platform), token), account);
      const { data: n, error } = await db.rpc('marketing_upsert_comments', { p_account: id, p_rows: rows });
      if (error) throw error;
      out.push({ account: id, comments: Number(n) || 0 });
    } catch (err) {
      await handleGraphError(id, err);
      out.push({ account: id, error: errMsg(err) });
    }
  }
  return out;
}

async function loadComment(commentId: string) {
  const { data, error } = await db.from('marketing_comments').select('id, account_id, external_id').eq('id', commentId).single();
  if (error || !data) throw new Error('Comentário não encontrado.');
  return { comment: data, ...(await loadAccount(data.account_id)) };
}

// ---------- tokens ----------

async function refreshTokens() {
  const soon = new Date(Date.now() + 15 * 86_400_000).toISOString();
  const { data: accounts } = await db.from('marketing_accounts').select('id')
    .eq('platform', 'threads').eq('status', 'ok').lt('token_expires_at', soon);
  let refreshed = 0;
  for (const { id } of accounts || []) {
    try {
      const { token } = await loadAccount(id);
      const r = await request(fetch, `https://graph.threads.net/refresh_access_token?${new URLSearchParams({
        grant_type: 'th_refresh_token', access_token: token,
      })}`);
      await db.from('marketing_tokens').update({
        token_enc: await encryptToken(TOKEN_KEY, String(r.access_token)), updated_at: new Date().toISOString(),
      }).eq('account_id', id);
      await db.from('marketing_accounts').update({
        token_expires_at: new Date(Date.now() + Number(r.expires_in || 5_184_000) * 1000).toISOString(),
      }).eq('id', id);
      refreshed++;
    } catch (err) {
      await markReconnect(id, `Não deu para renovar o acesso: ${errMsg(err)}`);
    }
  }
  return { refreshed };
}

// ---------- entrada ----------

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!TOKEN_KEY) return json({ error: 'Falta configurar MARKETING_TOKEN_KEY nas Edge Functions.' }, 503);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (req.headers.has(CRON_SECRET_HEADER)) {
    if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });
    try {
      if (body.job === 'publish') return json({ results: await runQueue(null) });
      if (body.job === 'sync') return json({ results: await syncComments() });
      if (body.job === 'refresh') return json(await refreshTokens());
      return json({ error: 'Job inválido.' }, 400);
    } catch (err) {
      console.error('marketing cron:', err);
      return json({ error: errMsg(err) }, 500);
    }
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userRes } = await callerClient.auth.getUser();
  if (!userRes?.user) return json({ error: 'Não autenticado.' }, 401);
  const { data: can } = await callerClient.rpc('admin_can', { area: 'marketing' });
  if (can !== true) return json({ error: 'Seu perfil não tem a área Marketing.' }, 403);
  const adminId = userRes.user.id;
  const audit = (action: string, details: Record<string, unknown>) =>
    db.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: null, action, details });

  try {
    switch (body.action) {
      case 'run': {
        if (typeof body.postId !== 'string') return json({ error: 'Falta postId.' }, 400);
        return json({ results: await runQueue(body.postId) });
      }
      case 'sync':
        return json({ results: await syncComments() });
      case 'delete': {
        if (typeof body.postId !== 'string') return json({ error: 'Falta postId.' }, 400);
        const out = await deletePost(body.postId);
        await audit('marketingDeletePost', { post: body.postId, removed: out.removed, failed: out.results.filter((r) => !r.ok).length });
        return json(out);
      }
      case 'reply': {
        const text = String(body.text || '').trim();
        if (!text) return json({ error: 'Escreva a resposta.' }, 400);
        if (text.length > 2000) return json({ error: 'Resposta passa de 2.000 caracteres.' }, 400);
        const { comment, account, token } = await loadComment(String(body.commentId || ''));
        try {
          await replyToComment(makeApi(fetch, baseFor(account.platform), token), account, comment.external_id, text);
        } catch (err) {
          await handleGraphError(account.id, err);
          throw err;
        }
        await db.from('marketing_comments').update({
          answered: true, reply_text: text, replied_at: new Date().toISOString(), replied_by: adminId,
        }).eq('id', comment.id);
        await audit('marketingReply', { comment: comment.id, platform: account.platform, text: text.slice(0, 200) });
        return json({ ok: true });
      }
      case 'hide': {
        const hidden = body.hidden === true;
        const { comment, account, token } = await loadComment(String(body.commentId || ''));
        try {
          await setCommentHidden(makeApi(fetch, baseFor(account.platform), token), account, comment.external_id, hidden);
        } catch (err) {
          await handleGraphError(account.id, err);
          throw err;
        }
        await db.from('marketing_comments').update({ hidden }).eq('id', comment.id);
        await audit(hidden ? 'marketingHideComment' : 'marketingShowComment', { comment: comment.id, platform: account.platform });
        return json({ ok: true });
      }
      default:
        return json({ error: 'Ação inválida.' }, 400);
    }
  } catch (err) {
    console.error('marketing:', err);
    return json({ error: errMsg(err) }, 502);
  }
});
