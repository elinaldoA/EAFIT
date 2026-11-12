import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  type Account, checkPost, continuePublish, decryptToken, deletePublished, encryptToken, fetchAdAccounts, fetchAds, fetchComments, fetchMetrics, GraphError, makeApi,
  replyToComment, setCommentHidden, signState, startPublish, trackedCaption, verifyState,
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
  assertEquals(checkPost('instagram', { id: 'p', caption: 'a'.repeat(2201), media: [IMG(1)] }), 'Legenda passa de 2200 caracteres.');
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

Deno.test('checkPost: story só com uma mídia', () => {
  const story = (media: { type: 'image' | 'video'; url: string }[]) => ({ id: 'p', caption: '', media, format: 'story' as const });
  assertEquals(checkPost('instagram', story([IMG(1), IMG(2)])), 'Story leva exatamente uma imagem ou um vídeo.');
  assertEquals(checkPost('instagram', story([IMG(1)])), null);
});

Deno.test('Instagram: story cria container STORIES sem legenda', async () => {
  const { fn, calls } = fakeFetch({
    'POST /IG1/media': { id: 'S1' },
    'GET /S1': { status_code: 'FINISHED' },
    'POST /IG1/media_publish': { id: 'M2' },
    'GET /M2': {},
  });
  const step = await startPublish(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), IG,
    { id: 'p', caption: '', media: [IMG(1)], format: 'story' });
  assertEquals(step, { state: 'published', externalId: 'M2', permalink: null });
  assertEquals(calls[0].params, { media_type: 'STORIES', image_url: 'https://x.com/1.jpg', access_token: 'tok' });
});

Deno.test('Facebook: story de foto sobe a foto sem publicar e usa photo_stories', async () => {
  const { fn, calls } = fakeFetch({
    'POST /P1/photos': { id: 'ph7' },
    'POST /P1/photo_stories': { success: true, post_id: 'ST1' },
    'GET /ST1': {},
  });
  const step = await startPublish(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), PAGE,
    { id: 'p', caption: '', media: [IMG(1)], format: 'story' });
  assertEquals(step.state === 'published' && step.externalId, 'ST1');
  assertEquals(calls[0].params.published, 'false');
  assertEquals(calls[1].params.photo_id, 'ph7');
});

Deno.test('Facebook: story de vídeo abre o upload, manda a URL e fecha', async () => {
  const { fn, calls } = fakeFetch({
    'POST /P1/video_stories': (p) => (p.upload_phase === 'start'
      ? { video_id: 'V1', upload_url: 'https://rupload.facebook.com/video-upload/v23.0/V1' }
      : { success: true, post_id: 'ST2' }),
    'POST /video-upload/v23.0/V1': { success: true },
    'GET /ST2': {},
  });
  const step = await startPublish(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), PAGE,
    { id: 'p', caption: '', media: [{ type: 'video', url: 'https://x.com/v.mp4' }], format: 'story' });
  assertEquals(step.state === 'published' && step.externalId, 'ST2');
  assertEquals(calls.map((c) => c.path), ['/P1/video_stories', '/video-upload/v23.0/V1', '/P1/video_stories', '/ST2']);
  assertEquals(calls[2].params, { upload_phase: 'finish', video_id: 'V1', access_token: 'tok' });
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

Deno.test('comentários do Instagram', async () => {
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

});

Deno.test('responder e ocultar usam o endpoint de cada rede', async () => {
  const { fn, calls } = fakeFetch({
    'POST /c1/comments': { id: 'r' }, 'POST /k1/replies': { id: 'r' },
    'POST /c1': { success: true }, 'POST /k1': { success: true },
  });
  const api = makeApi(fn, 'https://g', 't');
  await replyToComment(api, PAGE, 'c1', 'Oi');
  await replyToComment(api, IG, 'k1', 'Oi');
  await setCommentHidden(api, PAGE, 'c1', true);
  await setCommentHidden(api, IG, 'k1', false);
  assertEquals(calls.slice(-2).map((c) => [c.path, c.params.is_hidden ?? c.params.hide]), [['/c1', 'true'], ['/k1', 'false']]);
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

Deno.test('métricas do Instagram: curtidas, alcance e salvamentos; sem permissão fica só o básico', async () => {
  const media = {
    data: [
      { id: 'm1', caption: 'Reel', permalink: 'https://ig/p/1', timestamp: '2026-11-04T15:00:00+0000', media_type: 'VIDEO', media_product_type: 'REELS', like_count: 12, comments_count: 3, thumbnail_url: 'https://x/t.jpg' },
      { id: 'm2', caption: 'Foto', permalink: 'https://ig/p/2', timestamp: '2026-11-03T15:00:00+0000', media_type: 'IMAGE', media_product_type: 'FEED', like_count: 5, comments_count: 0, media_url: 'https://x/m.jpg' },
    ],
  };
  const withInsights = fakeFetch({
    'GET /IG1/media': media,
    'GET /m1/insights': { data: [{ name: 'reach', values: [{ value: 300 }] }, { name: 'saved', values: [{ value: 9 }] }, { name: 'shares', values: [{ value: 4 }] }, { name: 'views', values: [{ value: 800 }] }] },
    'GET /m2/insights': { data: [{ name: 'reach', values: [{ value: 90 }] }, { name: 'saved', values: [{ value: 1 }] }] },
  });
  const rows = await fetchMetrics(makeApi(withInsights.fn, 'https://graph.facebook.com/v23.0', 't'), IG);
  assertEquals(rows.map((r) => [r.kind, r.likes, r.comments, r.reach, r.saves, r.shares, r.views, r.insights_ok]), [
    ['reel', 12, 3, 300, 9, 4, 800, true],
    ['image', 5, 0, 90, 1, null, null, true],
  ]);
  assertEquals(rows[0].thumb_url, 'https://x/t.jpg');

  // Permissão de insights negada (código 10): não tenta de novo nos outros posts.
  const denied = fakeFetch({
    'GET /IG1/media': media,
    'GET /m1/insights': () => ({ error: { message: 'permission', code: 10 } }),
  });
  const basic = await fetchMetrics(makeApi(denied.fn, 'https://graph.facebook.com/v23.0', 't'), IG);
  assertEquals(basic.map((r) => [r.likes, r.reach, r.insights_ok]), [[12, null, false], [5, null, false]]);
  assertEquals(denied.calls.filter((c) => c.path.endsWith('/insights')).length, 1);
});

Deno.test('métricas do Facebook: reações, comentários e compartilhamentos', async () => {
  const fb = fakeFetch({
    'GET /P1/published_posts': {
      data: [{
        id: 'P1_9', message: 'Oi', permalink_url: 'https://fb/9', created_time: '2026-11-04T15:00:00+0000', full_picture: 'https://x/f.jpg',
        attachments: { data: [{ media_type: 'photo' }] }, shares: { count: 2 },
        reactions: { summary: { total_count: 14 } }, comments: { summary: { total_count: 3 } },
      }],
    },
    'GET /P1_9/insights': { data: [{ name: 'post_impressions_unique', values: [{ value: 410 }] }] },
  });
  const [row] = await fetchMetrics(makeApi(fb.fn, 'https://graph.facebook.com/v23.0', 't'), PAGE);
  assertEquals([row.kind, row.likes, row.comments, row.shares, row.reach], ['image', 14, 3, 2, 410]);
});

Deno.test('trackedCaption: Facebook leva link com o id do post; Instagram, story e TikTok nao', () => {
  const post = { id: 'AB12CD34-0000-4000-8000-000000000000', caption: 'Treino de hoje', format: 'feed' as const };
  assertEquals(
    trackedCaption('facebook', post),
    'Treino de hoje\n\nComece agora: https://eafit.com.br/app/?utm_source=facebook&utm_medium=post&utm_content=ab12cd34',
  );
  assertEquals(trackedCaption('instagram', post), 'Treino de hoje');
  assertEquals(trackedCaption('tiktok', post), 'Treino de hoje');
  assertEquals(trackedCaption('facebook', { ...post, format: 'story' }), 'Treino de hoje');
});

Deno.test('trackedCaption: nao duplica o link nem estoura o limite da rede', () => {
  const tagged = { id: 'ab12cd34', caption: 'Veja https://eafit.com.br/app/?utm_content=x', format: 'feed' as const };
  assertEquals(trackedCaption('facebook', tagged), tagged.caption);
  const full = { id: 'ab12cd34', caption: 'a'.repeat(62_980), format: 'feed' as const };
  assertEquals(trackedCaption('facebook', full), full.caption);
});

Deno.test('anúncios: lista as contas e soma gasto, alcance e cliques por anúncio', async () => {
  const { fn, calls } = fakeFetch({
    'GET /me/adaccounts': { data: [{ id: 'act_99', account_id: '99', name: 'EAFIT', currency: 'BRL', account_status: 1 }] },
    'GET /act_99/ads': {
      data: [
        { id: 'ad1', name: 'Reel promovido', effective_status: 'ACTIVE', creative: { thumbnail_url: 'https://t/1.jpg', instagram_permalink_url: 'https://instagram.com/p/x/' },
          insights: { data: [{ spend: '12.50', impressions: '4000', reach: '3000', clicks: '90', inline_link_clicks: '40', actions: [{ action_type: 'link_click', value: '40' }, { action_type: 'lead', value: '3' }] }] } },
        { id: 'ad2', name: 'Parado', effective_status: 'PAUSED', creative: {} },
        { id: 'ad3', name: 'Post do Facebook', effective_status: 'ACTIVE', creative: { effective_object_story_id: 'P1_55' },
          insights: { data: [{ spend: '30', impressions: '9000', reach: '7000', clicks: '120' }] } },
      ],
    },
  });
  const api = makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok');
  assertEquals(await fetchAdAccounts(api), [{ id: '99', name: 'EAFIT', currency: 'BRL', account_status: 1 }]);
  const ads = await fetchAds(api, '99', 30, new Date('2026-11-12T12:00:00Z'));
  assertEquals(ads.map((a) => a.id), ['ad3', 'ad1']); // sem entrega some; maior gasto primeiro
  assertEquals(ads[1].clicks, 40); // cliques no link, não os totais
  assertEquals(ads[1].results, 3);
  assertEquals(ads[1].permalink, 'https://instagram.com/p/x/');
  assertEquals(ads[0].clicks, 120); // sem inline_link_clicks cai nos cliques totais
  assertEquals(ads[0].permalink, 'https://www.facebook.com/P1_55');
  assertEquals(ads[0].post_id, 'P1_55');
  assertEquals(calls[1].params.fields.includes('"since":"2026-10-13"'), true);
});

Deno.test('métricas do Instagram: stories no ar entram como story (respostas viram comentários)', async () => {
  const { fn } = fakeFetch({
    'GET /IG1/media': { data: [] },
    'GET /IG1/stories': { data: [{ id: 's1', permalink: 'https://instagram.com/stories/x/1', timestamp: '2026-11-12T10:00:00+0000', thumbnail_url: 'https://t/s.jpg' }] },
    'GET /s1/insights': { data: [
      { name: 'reach', values: [{ value: 320 }] }, { name: 'replies', values: [{ value: 7 }] },
      { name: 'shares', values: [{ value: 2 }] }, { name: 'views', values: [{ value: 410 }] },
    ] },
  });
  const rows = await fetchMetrics(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), IG);
  assertEquals(rows.length, 1);
  assertEquals([rows[0].kind, rows[0].comments, rows[0].shares, rows[0].reach, rows[0].views, rows[0].likes], ['story', 7, 2, 320, 410, null]);
});

Deno.test('métricas do Instagram: conta sem stories não derruba as métricas do feed', async () => {
  const { fn } = fakeFetch({
    'GET /IG1/media': { data: [{ id: 'm1', caption: 'x', media_type: 'IMAGE', like_count: 3, comments_count: 1 }] },
    'GET /m1/insights': { data: [] },
  }); // sem rota de /stories: a Meta responde erro
  const rows = await fetchMetrics(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), IG);
  assertEquals(rows.map((r) => r.external_id), ['m1']);
});

Deno.test('métricas: sem permissão de insights, devolve o motivo da Meta em diag', async () => {
  const { fn } = fakeFetch({
    'GET /IG1/media': { data: [{ id: 'm1', caption: 'x', media_type: 'IMAGE', like_count: 3, comments_count: 1 }] },
    'GET /m1/insights': { error: { message: '(#10) Application does not have permission for this action', code: 10 } },
  });
  const diag: { insightsError?: string } = {};
  const rows = await fetchMetrics(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), IG, diag);
  assertEquals(rows[0].insights_ok, false);
  assertEquals(diag.insightsError, '(#10) Application does not have permission for this action (código 10)');
});

Deno.test('métricas: com alcance chegando, diag fica vazio', async () => {
  const { fn } = fakeFetch({
    'GET /IG1/media': { data: [{ id: 'm1', caption: 'x', media_type: 'IMAGE' }] },
    'GET /m1/insights': { data: [{ name: 'reach', values: [{ value: 50 }] }] },
  });
  const diag: { insightsError?: string } = {};
  const rows = await fetchMetrics(makeApi(fn, 'https://graph.facebook.com/v23.0', 'tok'), IG, diag);
  assertEquals(rows[0].reach, 50);
  assertEquals(diag.insightsError, undefined);
});

Deno.test('métricas do Facebook: usa as métricas novas de views e cai na antiga se a Meta recusar', async () => {
  const post = { id: 'P1_9', message: 'x', permalink_url: 'https://fb/9', created_time: '2026-11-10T10:00:00+0000' };
  const novo = fakeFetch({
    'GET /P1/published_posts': { data: [post] },
    'GET /P1_9/insights': (p) => (p.metric.includes('post_total_media_view_unique')
      ? { data: [{ name: 'post_total_media_view_unique', values: [{ value: 120 }] }, { name: 'post_media_view', values: [{ value: 200 }] }] }
      : { data: [] }),
  });
  const a = await fetchMetrics(makeApi(novo.fn, 'https://graph.facebook.com/v23.0', 'tok'), PAGE);
  assertEquals([a[0].reach, a[0].views, a[0].insights_ok], [120, 200, true]);

  const velho = fakeFetch({
    'GET /P1/published_posts': { data: [post] },
    'GET /P1_9/insights': (p) => (p.metric === 'post_impressions_unique'
      ? { data: [{ name: 'post_impressions_unique', values: [{ value: 80 }] }] }
      : { error: { message: '(#100) The value must be a valid insights metric', code: 100 } }),
  });
  const b = await fetchMetrics(makeApi(velho.fn, 'https://graph.facebook.com/v23.0', 'tok'), PAGE);
  assertEquals([b[0].reach, b[0].insights_ok], [80, true]);
});
