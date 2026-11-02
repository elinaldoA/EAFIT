import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { checkPost, GraphError } from './marketing.ts';
import { chunkPlan, continueTikTok, makeTikTokApi, oauthToken, parseToken, startTikTok, tokenFromOAuth } from './tiktok.ts';

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

// fetch falso: responde por "MÉTODO url-sem-query" e guarda as chamadas.
function fakeFetch(routes: Record<string, (body: unknown) => Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).split('?')[0];
    const method = init?.method || 'GET';
    const raw = init?.body;
    const body = typeof raw === 'string' ? (raw.startsWith('{') ? JSON.parse(raw) : raw) : raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw;
    calls.push({ method, url, headers: (init?.headers || {}) as Record<string, string>, body });
    const route = routes[`${method} ${url}`];
    return route ? route(body) : new Response(JSON.stringify({ error: { code: 'not_found', message: `sem rota ${method} ${url}` } }), { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}
const ok = (data: unknown) => new Response(JSON.stringify({ data, error: { code: 'ok', message: '' } }));
const API = 'https://open.tiktokapis.com/v2';
const VIDEO = { type: 'video' as const, url: 'https://cdn/v.mp4' };

Deno.test('checkPost: TikTok só aceita um vídeo e não tem story', () => {
  assertEquals(checkPost('tiktok', { id: 'p', caption: 'x', media: [{ type: 'image', url: 'https://a' }] }), 'TikTok pelo painel aceita só um vídeo por post.');
  assertEquals(checkPost('tiktok', { id: 'p', caption: '', media: [VIDEO], format: 'story' }), 'TikTok não tem stories pelo painel.');
  assertEquals(checkPost('tiktok', { id: 'p', caption: 'x', media: [VIDEO] }), null);
});

Deno.test('token: guarda acesso e refresh com o vencimento do acesso', () => {
  const tok = tokenFromOAuth({ access_token: 'A', refresh_token: 'R', expires_in: 86400 }, 1_000);
  assertEquals(tok, { access: 'A', refresh: 'R', accessExp: 86_401_000 });
  assertEquals(parseToken(JSON.stringify(tok)), tok);
});

Deno.test('oauth: refresh vencido pede reconexão', async () => {
  const { fn } = fakeFetch({
    [`POST ${API}/oauth/token/`]: () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token is invalid' }), { status: 400 }),
  });
  const err = await assertRejects(() => oauthToken(fn, { grant_type: 'refresh_token', refresh_token: 'R' }), GraphError);
  assertEquals(err.needsReconnect, true);
});

Deno.test('api: error.code "ok" é sucesso; token inválido pede reconexão', async () => {
  const { fn } = fakeFetch({
    [`GET ${API}/user/info/`]: () => ok({ user: { open_id: 'U1' } }),
    [`POST ${API}/post/publish/creator_info/query/`]: () =>
      new Response(JSON.stringify({ data: {}, error: { code: 'access_token_invalid', message: 'expired' } }), { status: 401 }),
  });
  const api = makeTikTokApi(fn, 'A');
  assertEquals(await api.get('/user/info/', { fields: 'open_id' }), { user: { open_id: 'U1' } });
  const err = await assertRejects(() => api.post('/post/publish/creator_info/query/'), GraphError);
  assertEquals(err.needsReconnect, true);
});

Deno.test('partes: até 64 MB numa só; acima, 10 MB e a última leva o resto', () => {
  assertEquals(chunkPlan(4_000_000), { chunkSize: 4_000_000, count: 1 });
  const big = 100 * 1024 * 1024 + 5;
  assertEquals(chunkPlan(big), { chunkSize: 10 * 1024 * 1024, count: 10 });
});

Deno.test('publicar: baixa o vídeo, abre como privado sem auditoria e envia o arquivo', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const { fn, calls } = fakeFetch({
    'GET https://cdn/v.mp4': () => new Response(bytes),
    [`POST ${API}/post/publish/creator_info/query/`]: () => ok({ privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }),
    [`POST ${API}/post/publish/video/init/`]: () => ok({ publish_id: 'PUB1', upload_url: 'https://up.tiktok/u1' }),
    'PUT https://up.tiktok/u1': () => new Response(null, { status: 201 }),
  });
  const step = await startTikTok(makeTikTokApi(fn, 'A'), fn, { id: 'p', caption: 'Treino #gym', media: [VIDEO] }, false);
  assertEquals(step, { state: 'processing', containerId: 'PUB1', retryInSec: 15 });
  const init = calls[2].body as { post_info: Record<string, unknown>; source_info: Record<string, unknown> };
  assertEquals(init.post_info.privacy_level, 'SELF_ONLY');
  assertEquals(init.post_info.title, 'Treino #gym');
  assertEquals(init.source_info, { source: 'FILE_UPLOAD', video_size: 5, chunk_size: 5, total_chunk_count: 1 });
  assertEquals(calls[3].headers['Content-Range'], 'bytes 0-4/5');
});

Deno.test('publicar: com auditoria sai público', async () => {
  const { fn, calls } = fakeFetch({
    'GET https://cdn/v.mp4': () => new Response(new Uint8Array([1])),
    [`POST ${API}/post/publish/creator_info/query/`]: () => ok({ privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }),
    [`POST ${API}/post/publish/video/init/`]: () => ok({ publish_id: 'PUB2', upload_url: 'https://up.tiktok/u2' }),
    'PUT https://up.tiktok/u2': () => new Response(null, { status: 201 }),
  });
  await startTikTok(makeTikTokApi(fn, 'A'), fn, { id: 'p', caption: 'x', media: [VIDEO] }, true);
  assertEquals((calls[2].body as { post_info: { privacy_level: string } }).post_info.privacy_level, 'PUBLIC_TO_EVERYONE');
});

Deno.test('status: processando, concluído com link e falha', async () => {
  let reply: unknown = { status: 'PROCESSING_UPLOAD' };
  const { fn } = fakeFetch({ [`POST ${API}/post/publish/status/fetch/`]: () => ok(reply) });
  const api = makeTikTokApi(fn, 'A');
  assertEquals(await continueTikTok(api, 'eafitapp', 'PUB1', true), { state: 'processing', containerId: 'PUB1', retryInSec: 15 });

  reply = { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7123] };
  assertEquals(await continueTikTok(api, 'eafitapp', 'PUB1', true), {
    state: 'published', externalId: '7123', permalink: 'https://www.tiktok.com/@eafitapp/video/7123', note: undefined,
  });

  reply = { status: 'PUBLISH_COMPLETE' };
  const priv = await continueTikTok(api, 'eafitapp', 'PUB1', false);
  assertEquals(priv.state === 'published' && [priv.externalId, priv.permalink, !!priv.note], ['PUB1', null, true]);

  reply = { status: 'FAILED', fail_reason: 'video_pull_failed' };
  await assertRejects(() => continueTikTok(api, 'eafitapp', 'PUB1', true), GraphError, 'video_pull_failed');
});
