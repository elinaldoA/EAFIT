import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { checkPost, GraphError } from './marketing.ts';
import {
  deleteYouTube, myChannel, oauthToken, parseToken, publishYouTube, snippetAndStatus, tokenFromOAuth, videoText,
} from './youtube.ts';

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
    return route ? route(body) : new Response(JSON.stringify({ error: { code: 404, message: `sem rota ${method} ${url}` } }), { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const SESSION = 'https://upload.youtube.example/session/abc';
const VIDEO = { type: 'video' as const, url: 'https://cdn/v.mp4' };
const POST = { id: 'p', caption: 'Treino de hoje\nVeja no app', media: [VIDEO] };

Deno.test('checkPost: YouTube só aceita um vídeo e não tem story', () => {
  assertEquals(checkPost('youtube', { id: 'p', caption: 'x', media: [{ type: 'image', url: 'https://a' }] }), 'YouTube pelo painel aceita só um vídeo por post.');
  assertEquals(checkPost('youtube', { id: 'p', caption: '', media: [VIDEO], format: 'story' }), 'YouTube não tem stories pelo painel.');
  assertEquals(checkPost('youtube', { id: 'p', caption: 'x', media: [VIDEO] }), null);
});

Deno.test('token: o refresh vem do login; na renovação vale o antigo', () => {
  const first = tokenFromOAuth({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }, 1_000);
  assertEquals(first, { access: 'A', refresh: 'R', accessExp: 3_601_000 });
  assertEquals(tokenFromOAuth({ access_token: 'B', expires_in: 3600 }, 2_000, 'R'), { access: 'B', refresh: 'R', accessExp: 3_602_000 });
  assertEquals(parseToken(JSON.stringify(first)), first);
});

Deno.test('token: login sem refresh pede para conectar de novo', () => {
  try {
    tokenFromOAuth({ access_token: 'A', expires_in: 3600 });
    throw new Error('devia falhar');
  } catch (err) {
    assertEquals(err instanceof GraphError && err.needsReconnect, true);
  }
});

Deno.test('oauth: refresh revogado pede reconexão', async () => {
  const { fn } = fakeFetch({
    'POST https://oauth2.googleapis.com/token': () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 }),
  });
  const err = await assertRejects(() => oauthToken(fn, { grant_type: 'refresh_token' }), GraphError);
  assertEquals((err as GraphError).needsReconnect, true);
});

Deno.test('canal: lê id, nome e @ da conta; sem canal avisa', async () => {
  const { fn } = fakeFetch({
    'GET https://www.googleapis.com/youtube/v3/channels': () => new Response(JSON.stringify({
      items: [{ id: 'UC1', snippet: { title: 'EAFIT App', customUrl: '@eafitapp', thumbnails: { default: { url: 'https://img/a.jpg' } } } }],
    })),
  });
  assertEquals(await myChannel(fn, 'tok'), { id: 'UC1', title: 'EAFIT App', handle: 'eafitapp', pictureUrl: 'https://img/a.jpg' });

  const empty = fakeFetch({ 'GET https://www.googleapis.com/youtube/v3/channels': () => new Response(JSON.stringify({})) });
  await assertRejects(() => myChannel(empty.fn, 'tok'), GraphError, 'não tem canal');
});

Deno.test('texto: título é a primeira linha (até 100, sem < >) e a descrição é tudo', () => {
  assertEquals(videoText('Treino de hoje\nVeja no app'), { title: 'Treino de hoje', description: 'Treino de hoje\nVeja no app' });
  assertEquals(videoText('').title, 'EAFIT App');
  assertEquals(videoText('<b>Oi</b>').title, 'bOi/b');
  const long = videoText('a'.repeat(150));
  assertEquals(long.title.length, 100);
  assertEquals(long.title.endsWith('…'), true);
});

Deno.test('metadados: privado até a auditoria, público depois; nunca "para crianças"', () => {
  const priv = snippetAndStatus(POST, false) as { status: Record<string, unknown> };
  assertEquals(priv.status, { privacyStatus: 'private', selfDeclaredMadeForKids: false });
  const pub = snippetAndStatus(POST, true) as { status: Record<string, unknown> };
  assertEquals(pub.status.privacyStatus, 'public');
});

Deno.test('publicar: baixa o vídeo, abre o upload resumível e envia o arquivo', async () => {
  const { fn, calls } = fakeFetch({
    'GET https://cdn/v.mp4': () => new Response(new Uint8Array([1, 2, 3, 4])),
    [`POST ${UPLOAD}`]: () => new Response('{}', { headers: { Location: SESSION } }),
    [`PUT ${SESSION}`]: () => new Response(JSON.stringify({ id: 'vid123', status: { privacyStatus: 'private' } })),
  });
  const step = await publishYouTube('tok', fn, POST, false);
  assertEquals(step.state, 'published');
  if (step.state !== 'published') return;
  assertEquals(step.externalId, 'vid123');
  assertEquals(step.permalink, 'https://www.youtube.com/watch?v=vid123');
  assertStringIncludes(step.note || '', 'privado');

  const init = calls.find((c) => c.method === 'POST')!;
  assertEquals(init.headers.Authorization, 'Bearer tok');
  assertEquals(init.headers['X-Upload-Content-Length'], '4');
  assertEquals((init.body as { snippet: { title: string } }).snippet.title, 'Treino de hoje');
});

Deno.test('publicar: público não leva aviso, a menos que o YouTube trave', async () => {
  const route = (privacy: string) => fakeFetch({
    'GET https://cdn/v.mp4': () => new Response(new Uint8Array([1])),
    [`POST ${UPLOAD}`]: () => new Response('{}', { headers: { Location: SESSION } }),
    [`PUT ${SESSION}`]: () => new Response(JSON.stringify({ id: 'v', status: { privacyStatus: privacy } })),
  }).fn;
  const ok = await publishYouTube('tok', route('public'), POST, true);
  assertEquals(ok.state === 'published' && ok.note, undefined);
  const locked = await publishYouTube('tok', route('private'), POST, true);
  assertStringIncludes(locked.state === 'published' ? locked.note || '' : '', 'deixou o vídeo privado');
});

Deno.test('publicar: cota estourada vira mensagem clara; 401 pede reconexão', async () => {
  const quota = fakeFetch({
    'GET https://cdn/v.mp4': () => new Response(new Uint8Array([1])),
    [`POST ${UPLOAD}`]: () => new Response(JSON.stringify({ error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 }),
  });
  await assertRejects(() => publishYouTube('tok', quota.fn, POST, false), GraphError, 'cota diária');

  const expired = fakeFetch({
    'GET https://cdn/v.mp4': () => new Response(new Uint8Array([1])),
    [`POST ${UPLOAD}`]: () => new Response(JSON.stringify({ error: { code: 401, message: 'Invalid Credentials' } }), { status: 401 }),
  });
  const err = await assertRejects(() => publishYouTube('tok', expired.fn, POST, false), GraphError);
  assertEquals((err as GraphError).needsReconnect, true);
});

Deno.test('apagar: 204 e 404 contam como feito; outros erros sobem', async () => {
  const del = (status: number) => fakeFetch({
    'DELETE https://www.googleapis.com/youtube/v3/videos': () => new Response(status === 204 ? null : JSON.stringify({ error: { code: status, message: 'x' } }), { status }),
  }).fn;
  await deleteYouTube('tok', del(204), 'v');
  await deleteYouTube('tok', del(404), 'v');
  await assertRejects(() => deleteYouTube('tok', del(403), 'v'), GraphError);
});
