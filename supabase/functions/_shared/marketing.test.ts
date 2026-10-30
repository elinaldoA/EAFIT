import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  type Account, checkPost, continuePublish, decryptToken, deletePublished, encryptToken, fetchComments, GraphError, makeApi,
  replyToComment, setCommentHidden, signState, startPublish, verifyState,
} from './marketing.ts';

type Call = { method: string; path: string; params: Record<string, string> };

// fetch falso: responde por "MÉTODO /caminho" e guarda as chamadas.
type Route = object | ((p: Record<string, string>) => unknown);

function fakeFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const params = Object.fromEntries(init?.body ? new URLSearchParams(String(init.body)) : url.searchParams);
    const path = url.pathname.replace(/^\/v[\d.]+/, '');
    calls.push({ method, path, params });
    const route = routes[`${method} ${path}`];
    if (route === undefined) return new Response(JSON.stringify({ error: { message: `sem rota ${method} ${path}`, code: 100 } }), { status: 400 });
    const body = typeof route === 'function' ? route(params) : route;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { fn, calls };
}

const PAGE: Account = { id: 'a1', platform: 'facebook', external_id: 'P1' };
const IG: Account = { id: 'a2', platform: 'instagram', external_id: 'IG1', username: 'eafit' };
const TH: Account = { id: 'a3', platform: 'threads', external_id: 'T1', username: 'eafit' };
const IMG = (n: number) => ({ type: 'image' as const, url: `https://x.com/${n}.jpg` });

Deno.test('token cifrado volta igual e não aparece em claro', async () => {
  const stored = await encryptToken('segredo', 'EAAB-token');
  assertEquals(stored.includes('EAAB'), false);
  assertEquals(await decryptToken('segredo', stored), 'EAAB-token');
  await assertRejects(() => decryptToken('outro', stored));
});

Deno.test('state do OAuth: válido, adulterado e vencido', async () => {
  const state = { admin: 'u1', provider: 'meta' as const, origin: 'https://eafit.com.br', exp: 2_000 };
  const signed = await signState('k', state);
  assertEquals(await verifyState('k', signed, 1_000), state);
  assertEquals(await verifyState('k', signed, 3_000), null);
  assertEquals(await verifyState('outra', signed, 1_000), null);
  const [body, sig] = signed.split('.');
  assertEquals(await verifyState('k', `${body}x.${sig}`, 1_000), null);
  assertEquals(await verifyState('k', 'lixo', 1_000), null);
});

Deno.test('checkPost barra o que a rede recusaria', () => {
  assertEquals(checkPost('instagram', { id: 'p', caption: 'oi', media: [] }), 'Instagram exige ao menos uma imagem ou vídeo.');
  assertEquals(checkPost('threads', { id: 'p', caption: 'a'.repeat(501), media: [] }), 'Legenda passa de 500 caracteres.');
  assertEquals(checkPost('facebook', { id: 'p', caption: '', media: [{ type: 'video', url: 'https://v' }, IMG(1)] }), 'Vídeo vai sozinho no post.');
  assertEquals(checkPost('facebook', { id: 'p', caption: 'oi', media: [] }), null);
});

Deno.test('Facebook: foto única sai direto com link', async () => {
  const { fn, calls } = fakeFetch({
    'POST /P1/photos': { id: 'ph1', post_id: 'P1_9' },
    'GET /P1_9': { permalink_url: 'https://www.facebook.com/eafit/posts/9' },
  });
  const step = await startPublish(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), PAGE, { id: 'p', caption: 'Bora!', media: [IMG(1)] });
  assertEquals(step, { state: 'published', externalId: 'P1_9', permalink: 'https://www.facebook.com/eafit/posts/9' });
  assertEquals(calls[0].params, { url: 'https://x.com/1.jpg', message: 'Bora!', access_token: 'tok' });
});

Deno.test('Facebook: várias fotos viram um post com attached_media', async () => {
  let n = 0;
  const { fn, calls } = fakeFetch({
    'POST /P1/photos': () => ({ id: `ph${++n}` }),
    'POST /P1/feed': { id: 'P1_10' },
    'GET /P1_10': { permalink_url: '/eafit/posts/10' },
  });
  const step = await startPublish(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), PAGE, { id: 'p', caption: 'x', media: [IMG(1), IMG(2)] });
  assertEquals(step.state === 'published' && step.permalink, 'https://www.facebook.com/eafit/posts/10');
  assertEquals(calls[0].params.published, 'false');
  assertEquals(calls[2].params['attached_media[1]'], JSON.stringify({ media_fbid: 'ph2' }));
});

Deno.test('Instagram: Reels fica em processamento até o container ficar pronto', async () => {
  let status = 'IN_PROGRESS';
  const { fn, calls } = fakeFetch({
    'POST /IG1/media': { id: 'C1' },
    'GET /C1': () => ({ status_code: status }),
    'POST /IG1/media_publish': { id: 'M1' },
    'GET /M1': { permalink: 'https://instagram.com/p/M1' },
  });
  const api = makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok');
  const post = { id: 'p', caption: 'Reels', media: [{ type: 'video' as const, url: 'https://x.com/v.mp4' }] };
  assertEquals(await startPublish(api, IG, post), { state: 'processing', containerId: 'C1', retryInSec: 30 });
  assertEquals(calls[0].params.media_type, 'REELS');
  status = 'FINISHED';
  assertEquals(await continuePublish(api, IG, post, 'C1'), { state: 'published', externalId: 'M1', permalink: 'https://instagram.com/p/M1' });
});

Deno.test('Instagram: carrossel cria filhos e container CAROUSEL; erro do container vira falha', async () => {
  let n = 0;
  const { fn, calls } = fakeFetch({
    'POST /IG1/media': (p) => ({ id: p.media_type === 'CAROUSEL' ? 'CAR' : `c${++n}` }),
    'GET /CAR': { status_code: 'ERROR', status: 'Error: imagem 4:5' },
  });
  const api = makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok');
  await assertRejects(() => startPublish(api, IG, { id: 'p', caption: 'c', media: [IMG(1), IMG(2)] }), GraphError, 'A rede recusou a mídia');
  assertEquals(calls[2].params.children, 'c1,c2');
});

Deno.test('Threads: texto puro publica quando o container está pronto', async () => {
  const { fn, calls } = fakeFetch({
    'POST /T1/threads': { id: 'TC' },
    'GET /TC': { status: 'FINISHED' },
    'POST /T1/threads_publish': { id: 'TP' },
    'GET /TP': { permalink: 'https://threads.net/@eafit/post/TP' },
  });
  const step = await startPublish(makeApi(fn, 'https://graph.threads.net/v1.0', 'tok'), TH, { id: 'p', caption: 'Olá', media: [] });
  assertEquals(step.state, 'published');
  assertEquals(calls[0].params.media_type, 'TEXT');
});

Deno.test('token inválido (190) pede reconexão', async () => {
  const fn = (async () => new Response(JSON.stringify({ error: { message: 'Session expired', code: 190 } }), { status: 400 })) as typeof fetch;
  const err = await assertRejects(() => makeApi(fn, 'https://g', 't').get('/me'), GraphError);
  assertEquals(err.needsReconnect, true);
});

Deno.test('comentários do Facebook: ignora os da Página e marca os respondidos', async () => {
  const { fn } = fakeFetch({
    'GET /P1/published_posts': {
      data: [{
        id: 'P1_1', message: 'Post', permalink_url: 'https://fb/1',
        comments: { data: [
          { id: 'c1', message: 'Quanto custa?', from: { id: 'u9', name: 'Ana' }, created_time: '2026-10-30T10:00:00+0000', comments: { data: [{ from: { id: 'P1' } }] } },
          { id: 'c2', message: 'Valeu!', from: { id: 'P1', name: 'EAFIT' } },
          { id: 'c3', message: 'Top', is_hidden: true },
        ] },
      }],
    },
  });
  const rows = await fetchComments(makeApi(fn, 'https://graph.facebook.com/v23.0', 't'), PAGE);
  assertEquals(rows.map((r) => [r.external_id, r.author, r.answered, r.hidden]), [
    ['c1', 'Ana', true, false],
    ['c3', 'Alguém no Facebook', false, true],
  ]);
});

Deno.test('comentários do Instagram e Threads', async () => {
  const ig = fakeFetch({
    'GET /IG1/media': {
      data: [{ id: 'm1', caption: 'Treino', permalink: 'https://ig/m1', comments: { data: [
        { id: 'k1', text: 'Amei', username: 'bia', timestamp: '2026-10-30T10:00:00+0000', replies: { data: [{ username: 'EAFIT' }] } },
        { id: 'k2', text: 'obrigado', username: 'eafit' },
      ] } }],
    },
  });
  const igRows = await fetchComments(makeApi(ig.fn, 'https://graph.facebook.com/v23.0', 't'), IG);
  assertEquals(igRows.map((r) => [r.external_id, r.author, r.answered]), [['k1', '@bia', true]]);

  const th = fakeFetch({
    'GET /T1/threads': { data: [{ id: 'th1', text: 'Post', permalink: 'https://threads/th1' }] },
    'GET /th1/conversation': { data: [
      { id: 'r1', text: 'Como baixo?', username: 'caio', replied_to: { id: 'th1' }, hide_status: 'NOT_HUSHED' },
      { id: 'r2', text: 'No site', username: 'eafit', replied_to: { id: 'r1' }, is_reply_owned_by_me: true },
      { id: 'r3', text: 'eu tbm', username: 'duda', replied_to: { id: 'r1' } },
      { id: 'r4', text: 'spam', username: 'bot', replied_to: { id: 'th1' }, hide_status: 'HIDDEN' },
    ] },
  });
  const thRows = await fetchComments(makeApi(th.fn, 'https://graph.threads.net/v1.0', 't'), TH);
  assertEquals(thRows.map((r) => [r.external_id, r.answered, r.hidden]), [['r1', true, false], ['r4', false, true]]);
});

Deno.test('responder e ocultar usam o endpoint de cada rede', async () => {
  const { fn, calls } = fakeFetch({
    'POST /c1/comments': { id: 'r' }, 'POST /k1/replies': { id: 'r' }, 'POST /T1/threads': { id: 'RC' }, 'POST /T1/threads_publish': { id: 'R' },
    'POST /c1': { success: true }, 'POST /k1': { success: true }, 'POST /r1/manage_reply': { success: true },
  });
  const api = makeApi(fn, 'https://g', 't');
  await replyToComment(api, PAGE, 'c1', 'Oi');
  await replyToComment(api, IG, 'k1', 'Oi');
  assertEquals(await replyToComment(api, TH, 'r1', 'Oi'), 'R');
  assertEquals(calls[2].params.reply_to_id, 'r1');
  await setCommentHidden(api, PAGE, 'c1', true);
  await setCommentHidden(api, IG, 'k1', false);
  await setCommentHidden(api, TH, 'r1', true);
  assertEquals(calls.slice(-3).map((c) => [c.path, c.params.is_hidden ?? c.params.hide]), [['/c1', 'true'], ['/k1', 'false'], ['/r1/manage_reply', 'true']]);
});

Deno.test('excluir: DELETE no id do post; já apagado na rede conta como apagado', async () => {
  const { fn, calls } = fakeFetch({ 'DELETE /P1_9': { success: true } });
  await deletePublished(makeApi(fn, 'https://graph.facebook.com/v23.0', 't'), 'P1_9');
  assertEquals([calls[0].method, calls[0].path, calls[0].params.access_token], ['DELETE', '/P1_9', 't']);

  const gone = (async () => new Response(JSON.stringify({
    error: { message: "Unsupported delete request. Object with ID 'X' does not exist", code: 100 },
  }), { status: 400 })) as typeof fetch;
  await deletePublished(makeApi(gone, 'https://g', 't'), 'X');

  const denied = (async () => new Response(JSON.stringify({ error: { message: 'Permissions error', code: 10 } }), { status: 400 })) as typeof fetch;
  await assertRejects(() => deletePublished(makeApi(denied, 'https://g', 't'), 'X'), GraphError, 'Permissions error');
});
