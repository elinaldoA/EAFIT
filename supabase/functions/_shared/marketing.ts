// Marketing (painel → Marketing): conversa com as APIs oficiais da Meta
// (Graph API para Página do Facebook e Instagram profissional) e com o TikTok.
// Usado por marketing-oauth (conectar contas) e marketing (publicar,
// comentários, renovar token). O fetch é injetado para os testes.
//
// Tokens nunca saem do servidor: ficam em public.marketing_tokens cifrados com
// AES-GCM (chave derivada do secret MARKETING_TOKEN_KEY).

// Cada versão da Graph API vale ~2 anos; ao trocar, conferir o changelog da Meta.
export const GRAPH_VERSION = 'v23.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type Platform = 'facebook' | 'instagram' | 'tiktok';
export type Media = { type: 'image' | 'video'; url: string; credit?: string };
export type Account = { id: string; platform: Platform; external_id: string; username?: string | null };
// format 'story': uma mídia, sem legenda (Instagram e Página do Facebook).
// Escolhas do TikTok feitas no painel (ver 20261227010000_marketing_tiktok_settings.sql).
export type TikTokSettings = {
  privacy_level: string; allow_comment: boolean; allow_duet: boolean; allow_stitch: boolean;
  brand_organic: boolean; brand_content: boolean;
};
export type Post = { id: string; caption: string; media: Media[]; format?: 'feed' | 'story'; tiktok?: TikTokSettings | null };

// Permissões pedidas no login. Com as contas da própria EAFIT e quem conecta
// com papel no app da Meta, o "acesso padrão" basta (sem App Review).
export const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement',
  'pages_read_user_content', 'business_management',
  'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_contents',
  // Resultados (alcance e salvamentos). Sem elas o painel mostra só curtidas e comentários.
  'read_insights', 'instagram_manage_insights',
  // Posts promovidos (Marketing → Resultados): só leitura de gasto e alcance dos anúncios.
  'ads_read',
];

export const CAPTION_LIMITS: Record<Platform, number> = { facebook: 63000, instagram: 2200, tiktok: 2200 };

// ---------- cifra e assinatura ----------

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return unb64(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`marketing-token:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(`marketing-state:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function encryptToken(secret: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(token)));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return b64(out);
}

export async function decryptToken(secret: string, stored: string): Promise<string> {
  const bytes = unb64(stored);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await aesKey(secret), bytes.slice(12));
  return dec.decode(plain);
}

export type OAuthState = { admin: string; provider: 'meta' | 'tiktok'; origin: string; exp: number };

// state do OAuth: quem pediu, para onde voltar e validade (10 min), assinado
// para ninguém forjar um retorno que conecte outra conta.
export async function signState(secret: string, state: OAuthState): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(state)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyState(secret: string, value: string, now = Date.now()): Promise<OAuthState | null> {
  const [body, sig] = String(value || '').split('.');
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const state = JSON.parse(dec.decode(unb64url(body))) as OAuthState;
    return state.exp > now ? state : null;
  } catch {
    return null;
  }
}

// ---------- cliente HTTP ----------

export class GraphError extends Error {
  code: number;
  constructor(message: string, code = 0) {
    super(message);
    this.code = code;
  }
  // 190 = token inválido/expirado: a conta precisa ser reconectada.
  get needsReconnect() {
    return this.code === 190;
  }
  // 100 = objeto não existe (já apagado direto na rede).
  get isGone() {
    return this.code === 100 && /does not exist|n[ãa]o existe|Unsupported (get|delete) request/i.test(this.message);
  }
}

type FetchFn = typeof fetch;
type Params = Record<string, string | number | boolean | undefined>;

export type Api = {
  get: (path: string, params?: Params) => Promise<Record<string, unknown>>;
  post: (path: string, params?: Params) => Promise<Record<string, unknown>>;
  del: (path: string) => Promise<Record<string, unknown>>;
  // POST numa URL completa com o token no cabeçalho (upload de vídeo do Facebook).
  upload: (url: string, headers: Record<string, string>) => Promise<Record<string, unknown>>;
};

function toQuery(params: Params): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  return q;
}

export async function request(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetchFn(url, init);
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // corpo vazio/HTML: cai no erro abaixo se o status não for 2xx
  }
  const err = data.error as { message?: string; error_user_msg?: string; code?: number } | undefined;
  if (!res.ok || err) {
    throw new GraphError(err?.error_user_msg || err?.message || `HTTP ${res.status}`, Number(err?.code) || 0);
  }
  return data;
}

export function makeApi(fetchFn: FetchFn, base: string, token: string): Api {
  return {
    get: (path, params = {}) => request(fetchFn, `${base}${path}?${toQuery({ ...params, access_token: token })}`),
    post: (path, params = {}) => request(fetchFn, `${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: toQuery({ ...params, access_token: token }),
    }),
    del: (path) => request(fetchFn, `${base}${path}?${toQuery({ access_token: token })}`, { method: 'DELETE' }),
    upload: (url, headers) => request(fetchFn, url, { method: 'POST', headers: { ...headers, Authorization: `OAuth ${token}` } }),
  };
}

export function baseFor(_platform: Platform): string {
  return GRAPH_BASE;
}

// ---------- publicação ----------

// O que a rede aceita deste post (o painel já valida; aqui é a última barreira).
export function checkPost(platform: Platform, post: Post): string | null {
  if (platform === 'tiktok') {
    if (post.format === 'story') return 'TikTok não tem stories pelo painel.';
    if (post.media.length !== 1 || post.media[0].type !== 'video') return 'TikTok pelo painel aceita só um vídeo por post.';
  }
  if (post.format === 'story') {
    if (post.media.length !== 1) return 'Story leva exatamente uma imagem ou um vídeo.';
    return null;
  }
  const videos = post.media.filter((m) => m.type === 'video').length;
  if (post.caption.length > CAPTION_LIMITS[platform]) return `Legenda passa de ${CAPTION_LIMITS[platform]} caracteres.`;
  if (videos > 1 || (videos === 1 && post.media.length > 1)) return 'Vídeo vai sozinho no post.';
  if (platform === 'instagram' && !post.media.length) return 'Instagram exige ao menos uma imagem ou vídeo.';
  if (!post.caption.trim() && !post.media.length) return 'Post vazio.';
  return null;
}

// O post do Facebook sai com um link do app marcado com o id do post (utm_content),
// para o painel ligar cada cadastro ao conteudo que o trouxe (Marketing -> Resultados).
// Instagram nao tem link na legenda e story nao tem legenda. Legenda que ja tem
// utm_content ou que estouraria o limite da rede sai como esta.
export function trackedCaption(platform: Platform, post: Pick<Post, 'id' | 'caption' | 'format'>): string {
  if (platform !== 'facebook' || post.format === 'story') return post.caption;
  if (post.caption.includes('utm_content=')) return post.caption;
  const content = post.id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  if (!content) return post.caption;
  const link = `https://eafit.com.br/app/?utm_source=${platform}&utm_medium=post&utm_content=${content}`;
  const text = `${post.caption.trimEnd()}\n\nComece agora: ${link}`.trimStart();
  return text.length > CAPTION_LIMITS[platform] ? post.caption : text;
}

// note: aviso que fica no alvo publicado (ex.: TikTok postou como privado).
export type Step =
  | { state: 'published'; externalId: string; permalink: string | null; note?: string }
  | { state: 'processing'; containerId: string; retryInSec: number };

async function permalinkOf(api: Api, platform: Platform, id: string): Promise<string | null> {
  try {
    const field = platform === 'facebook' ? 'permalink_url' : 'permalink';
    const data = await api.get(`/${id}`, { fields: field });
    const link = String(data[field] || '');
    if (!link) return null;
    return link.startsWith('/') ? `https://www.facebook.com${link}` : link;
  } catch {
    return null; // o post saiu; o link é só conveniência
  }
}

async function publishFacebook(api: Api, account: Account, post: Post): Promise<Step> {
  const page = account.external_id;
  const [first] = post.media;
  let id: string;
  if (!first) {
    id = String((await api.post(`/${page}/feed`, { message: post.caption })).id);
  } else if (first.type === 'video') {
    id = String((await api.post(`/${page}/videos`, { file_url: first.url, description: post.caption })).id);
  } else if (post.media.length === 1) {
    const r = await api.post(`/${page}/photos`, { url: first.url, message: post.caption });
    id = String(r.post_id || r.id);
  } else {
    const photoIds: string[] = [];
    for (const m of post.media) photoIds.push(String((await api.post(`/${page}/photos`, { url: m.url, published: false })).id));
    const attached = Object.fromEntries(photoIds.map((pid, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: pid })]));
    id = String((await api.post(`/${page}/feed`, { message: post.caption, ...attached })).id);
  }
  return { state: 'published', externalId: id, permalink: await permalinkOf(api, 'facebook', id) };
}

// Story da Página: foto sobe sem publicar e vira story; vídeo vai em três
// etapas (abre o upload, a Meta baixa da URL, fecha publicando).
async function publishFacebookStory(api: Api, account: Account, post: Post): Promise<Step> {
  const page = account.external_id;
  const [m] = post.media;
  let r: Record<string, unknown>;
  if (m.type === 'video') {
    const start = await api.post(`/${page}/video_stories`, { upload_phase: 'start' });
    await api.upload(String(start.upload_url), { file_url: m.url });
    r = await api.post(`/${page}/video_stories`, { upload_phase: 'finish', video_id: String(start.video_id) });
  } else {
    const photo = await api.post(`/${page}/photos`, { url: m.url, published: false });
    r = await api.post(`/${page}/photo_stories`, { photo_id: String(photo.id) });
  }
  const id = String(r.post_id || r.id);
  return { state: 'published', externalId: id, permalink: await permalinkOf(api, 'facebook', id) };
}

async function createInstagramContainer(api: Api, account: Account, post: Post): Promise<string> {
  const ig = account.external_id;
  if (post.format === 'story') {
    const m = post.media[0];
    const params = m.type === 'video' ? { media_type: 'STORIES', video_url: m.url } : { media_type: 'STORIES', image_url: m.url };
    return String((await api.post(`/${ig}/media`, params)).id);
  }
  if (post.media.length === 1) {
    const m = post.media[0];
    const params = m.type === 'video'
      ? { media_type: 'REELS', video_url: m.url, caption: post.caption, share_to_feed: true }
      : { image_url: m.url, caption: post.caption };
    return String((await api.post(`/${ig}/media`, params)).id);
  }
  const children: string[] = [];
  for (const m of post.media) children.push(String((await api.post(`/${ig}/media`, { image_url: m.url, is_carousel_item: true })).id));
  return String((await api.post(`/${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption })).id);
}

// O Instagram publica em duas etapas: cria o container, espera a rede
// processar a mídia (vídeo pode levar minutos) e publica. Facebook é direto.
export async function startPublish(api: Api, account: Account, post: Post): Promise<Step> {
  if (account.platform === 'facebook') {
    return post.format === 'story' ? publishFacebookStory(api, account, post) : publishFacebook(api, account, post);
  }
  if (account.platform !== 'instagram') throw new Error('Esta rede não publica por aqui.');
  const containerId = await createInstagramContainer(api, account, post);
  return continuePublish(api, account, post, containerId);
}

export async function continuePublish(api: Api, account: Account, post: Post, containerId: string): Promise<Step> {
  const data = await api.get(`/${containerId}`, { fields: 'status_code,status' });
  const status = String(data.status_code || '');
  if (status === 'ERROR' || status === 'EXPIRED') {
    throw new GraphError(`A rede recusou a mídia (${String(data.error_message || data.status || status)}).`);
  }
  if (status !== 'FINISHED' && status !== 'PUBLISHED') {
    const hasVideo = post.media.some((m) => m.type === 'video');
    return { state: 'processing', containerId, retryInSec: hasVideo ? 30 : 10 };
  }
  const id = String((await api.post(`/${account.external_id}/media_publish`, { creation_id: containerId })).id);
  return { state: 'published', externalId: id, permalink: await permalinkOf(api, account.platform, id) };
}

// ---------- comentários ----------

export type CommentRow = {
  external_id: string;
  post_external_id: string;
  post_permalink: string | null;
  post_caption: string;
  author: string;
  text: string;
  commented_at: string | null;
  hidden: boolean;
  answered: boolean;
};

type Obj = Record<string, unknown>;
const list = (v: unknown): Obj[] => (Array.isArray((v as Obj)?.data) ? (v as { data: Obj[] }).data : []);

// Últimos 10 posts de cada conta, até 50 comentários de primeiro nível em cada.
// Os da própria conta ficam de fora; "answered" = já tem resposta nossa.
export async function fetchComments(api: Api, account: Account): Promise<CommentRow[]> {
  const rows: CommentRow[] = [];
  const own = (account.username || '').toLowerCase();

  if (account.platform === 'facebook') {
    const page = account.external_id;
    const posts = await api.get(`/${page}/published_posts`, {
      fields: 'id,message,permalink_url,comments.limit(50){id,message,from,created_time,is_hidden,comments.limit(25){from}}',
      limit: 10,
    });
    for (const p of list(posts)) {
      for (const c of list(p.comments)) {
        const from = c.from as Obj | undefined;
        if (from?.id === page) continue;
        rows.push({
          external_id: String(c.id), post_external_id: String(p.id), post_permalink: (p.permalink_url as string) || null,
          post_caption: String(p.message || ''), author: String(from?.name || 'Alguém no Facebook'), text: String(c.message || ''),
          commented_at: (c.created_time as string) || null, hidden: !!c.is_hidden,
          answered: list(c.comments).some((r) => (r.from as Obj | undefined)?.id === page),
        });
      }
    }
  } else if (account.platform === 'instagram') {
    const media = await api.get(`/${account.external_id}/media`, {
      fields: 'id,caption,permalink,comments.limit(50){id,text,username,timestamp,hidden,replies{username}}',
      limit: 10,
    });
    for (const p of list(media)) {
      for (const c of list(p.comments)) {
        if (String(c.username || '').toLowerCase() === own) continue;
        rows.push({
          external_id: String(c.id), post_external_id: String(p.id), post_permalink: (p.permalink as string) || null,
          post_caption: String(p.caption || ''), author: `@${String(c.username || '')}`, text: String(c.text || ''),
          commented_at: (c.timestamp as string) || null, hidden: !!c.hidden,
          answered: list(c.replies).some((r) => String(r.username || '').toLowerCase() === own),
        });
      }
    }
  }
  return rows;
}

export async function replyToComment(api: Api, account: Account, commentId: string, text: string): Promise<string> {
  if (account.platform === 'facebook') return String((await api.post(`/${commentId}/comments`, { message: text })).id);
  if (account.platform === 'instagram') return String((await api.post(`/${commentId}/replies`, { message: text })).id);
  throw new Error('Esta rede não tem comentários pelo painel.');
}

export async function setCommentHidden(api: Api, account: Account, commentId: string, hidden: boolean): Promise<void> {
  if (account.platform === 'facebook') await api.post(`/${commentId}`, { is_hidden: hidden });
  else if (account.platform === 'instagram') await api.post(`/${commentId}`, { hide: hidden });
  else throw new Error('Esta rede não tem comentários pelo painel.');
}

// ---------- exclusão ----------

// Apaga o post publicado na rede (Facebook: pages_manage_posts; Instagram:
// instagram_manage_contents). Se ele já não existe
// lá (apagado direto na rede), conta como apagado.
export async function deletePublished(api: Api, externalId: string): Promise<void> {
  try {
    await api.del(`/${externalId}`);
  } catch (err) {
    if (err instanceof GraphError && err.isGone) return;
    throw err;
  }
}

// ---------- métricas dos posts ----------

export type MetricRow = {
  external_id: string;
  permalink: string | null;
  caption: string;
  kind: string; // reel | carousel | image | video | text | story
  thumb_url: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  views: number | null;
  insights_ok: boolean;
};

const num = (v: unknown): number | null => (v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));
const total = (v: unknown): number | null => num(((v as Obj | undefined)?.summary as Obj | undefined)?.total_count);

// Sem permissão de insights (ou o tipo de mídia não tem a métrica): o post fica só
// com o que a rede devolve de graça (curtidas e comentários).
const NO_PERMISSION = new Set([10, 200, 283]);

// Lê as métricas pedidas de um objeto (`/{id}/insights`); devolve nome → valor.
async function readInsights(api: Api, id: string, metrics: string): Promise<Record<string, number>> {
  const res = await api.get(`/${id}/insights`, { metric: metrics });
  const out: Record<string, number> = {};
  for (const m of list(res)) {
    const first = list({ data: m.values })[0];
    const value = first?.value ?? (m.total_value as Obj | undefined)?.value;
    if (typeof m.name === 'string' && typeof value === 'number') out[m.name] = value;
  }
  return out;
}

// Últimos 25 posts de cada conta com as métricas que a rede der. Roda também para
// posts feitos direto no app da rede (não só os do painel).
// `diag.insightsError` recebe a mensagem da Meta quando nenhum post trouxe alcance (para o painel
// explicar o motivo em vez de só mostrar a coluna vazia).
export async function fetchMetrics(api: Api, account: Account, diag: { insightsError?: string } = {}): Promise<MetricRow[]> {
  const rows: MetricRow[] = [];
  let insightsOn = true;
  // Uma tentativa de insights por post; permissão negada desliga o resto da conta.
  const tryInsights = async (id: string, metrics: string[]): Promise<Record<string, number> | null> => {
    if (!insightsOn) return null;
    let wanted = metrics;
    while (wanted.length) {
      try {
        return await readInsights(api, id, wanted.join(','));
      } catch (err) {
        if (!(err instanceof GraphError)) throw err;
        diag.insightsError ??= `${err.message} (código ${err.code})`;
        if (NO_PERMISSION.has(err.code)) { insightsOn = false; return null; }
        if (err.needsReconnect) throw err;
        wanted = wanted.slice(0, -1); // métrica que o tipo de mídia não tem: tenta com menos
      }
    }
    return null;
  };

  if (account.platform === 'instagram') {
    const media = await api.get(`/${account.external_id}/media`, {
      fields: 'id,caption,permalink,timestamp,media_type,media_product_type,like_count,comments_count,thumbnail_url,media_url',
      limit: 25,
    });
    for (const m of list(media)) {
      const kind = m.media_product_type === 'REELS' ? 'reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : m.media_type === 'VIDEO' ? 'video' : 'image';
      const ins = await tryInsights(String(m.id), ['reach', 'saved', 'shares', 'views']);
      rows.push({
        external_id: String(m.id), permalink: (m.permalink as string) || null, caption: String(m.caption || ''), kind,
        thumb_url: ((m.thumbnail_url || m.media_url) as string) || null, posted_at: (m.timestamp as string) || null,
        likes: num(m.like_count), comments: num(m.comments_count), shares: ins?.shares ?? null, saves: ins?.saved ?? null,
        reach: ins?.reach ?? null, views: ins?.views ?? null, insights_ok: ins !== null,
      });
    }
    // Stories no ar (24 h): o último retrato fica guardado quando o story sai da API.
    // Falha aqui (conta sem stories, permissão) não derruba as métricas do feed.
    try {
      const stories = await api.get(`/${account.external_id}/stories`, { fields: 'id,permalink,timestamp,thumbnail_url,media_url', limit: 25 });
      for (const st of list(stories)) {
        const ins = await tryInsights(String(st.id), ['reach', 'replies', 'shares', 'views']);
        rows.push({
          external_id: String(st.id), permalink: (st.permalink as string) || null, caption: '', kind: 'story',
          thumb_url: ((st.thumbnail_url || st.media_url) as string) || null, posted_at: (st.timestamp as string) || null,
          likes: null, comments: ins?.replies ?? null, shares: ins?.shares ?? null, saves: null,
          reach: ins?.reach ?? null, views: ins?.views ?? null, insights_ok: ins !== null,
        });
      }
    } catch (err) {
      if (err instanceof GraphError && err.needsReconnect) throw err;
    }
  } else if (account.platform === 'facebook') {
    const page = account.external_id;
    const posts = await api.get(`/${page}/published_posts`, {
      fields: 'id,message,permalink_url,created_time,full_picture,attachments{media_type},shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)',
      limit: 25,
    });
    for (const p of list(posts)) {
      const att = list(p.attachments)[0]?.media_type;
      const kind = att === 'video' ? 'video' : att === 'album' ? 'carousel' : att === 'photo' ? 'image' : 'text';
      // Meta trocou as métricas de impressões por "views" em 2025; a antiga fica de reserva.
      const ins = (await tryInsights(String(p.id), ['post_total_media_view_unique', 'post_media_view'])) ?? (await tryInsights(String(p.id), ['post_impressions_unique']));
      rows.push({
        external_id: String(p.id), permalink: (p.permalink_url as string) || null, caption: String(p.message || ''), kind,
        thumb_url: (p.full_picture as string) || null, posted_at: (p.created_time as string) || null,
        likes: total(p.reactions), comments: total(p.comments), shares: num((p.shares as Obj | undefined)?.count),
        saves: null, reach: ins?.post_total_media_view_unique ?? ins?.post_impressions_unique ?? null, views: ins?.post_media_view ?? null, insights_ok: ins !== null,
      });
    }
  }
  if (rows.some((r) => r.insights_ok)) delete diag.insightsError;
  return rows;
}

// ---------- edição ----------

// Só o Facebook deixa mudar o texto de um post já publicado pela API (vídeo usa
// `description`, o resto `message`). O Instagram não tem essa chamada: o
// caminho é apagar e publicar de novo.
export async function editPublished(api: Api, account: Account, externalId: string, caption: string, isVideo: boolean): Promise<void> {
  if (account.platform === 'instagram') {
    throw new Error('O Instagram não permite editar a legenda pela API. Exclua e publique de novo.');
  }
  if (account.platform !== 'facebook') throw new Error('Esta rede não permite editar pela API.');
  await api.post(`/${externalId}`, isVideo ? { description: caption } : { message: caption });
}

// ---------- posts promovidos (anúncios) ----------

export type AdAccountInfo = { id: string; name: string; currency: string; account_status: number | null };

// Contas de anúncios do usuário que fez o login (precisa de ads_read).
export async function fetchAdAccounts(api: Api): Promise<AdAccountInfo[]> {
  const res = await api.get('/me/adaccounts', { fields: 'account_id,name,currency,account_status', limit: 50 });
  return list(res).map((a) => ({
    id: String(a.account_id || String(a.id || '').replace(/^act_/, '')),
    name: String(a.name || ''), currency: String(a.currency || 'BRL'), account_status: num(a.account_status),
  })).filter((a) => a.id);
}

export type AdRow = {
  id: string;
  name: string;
  status: string; // effective_status da Meta (ACTIVE, PAUSED, ...)
  thumb_url: string | null;
  permalink: string | null; // post promovido (Instagram direto; Facebook pelo id do post)
  post_id: string | null; // id do post promovido (Facebook: Página_post; Instagram: id da mídia)
  spend: number; // na moeda da conta
  impressions: number;
  reach: number;
  clicks: number; // cliques no link (sem eles, os cliques totais)
  results: number; // cadastros/conversões que a Meta atribuiu ao anúncio
};

const toDay = (d: Date) => d.toISOString().slice(0, 10);

// Anúncios com entrega nos últimos `days` dias (até 100), do que mais gastou ao que menos.
export async function fetchAds(api: Api, adAccountId: string, days: number, now = new Date()): Promise<AdRow[]> {
  const until = toDay(now);
  const since = toDay(new Date(now.getTime() - Math.max(1, days) * 86_400_000));
  const range = JSON.stringify({ since, until });
  const res = await api.get(`/act_${adAccountId}/ads`, {
    fields: `id,name,effective_status,creative{thumbnail_url,instagram_permalink_url,effective_object_story_id,source_instagram_media_id},insights.time_range(${range}){spend,impressions,reach,clicks,inline_link_clicks,actions}`,
    limit: 100,
  });
  const rows: AdRow[] = [];
  for (const ad of list(res)) {
    const ins = list(ad.insights)[0];
    if (!ins) continue; // sem entrega no período
    const creative = (ad.creative || {}) as Obj;
    const story = String(creative.effective_object_story_id || '');
    const actions = Array.isArray(ins.actions) ? (ins.actions as Obj[]) : [];
    const results = actions
      .filter((a) => /lead|complete_registration|offsite_conversion/.test(String(a.action_type)))
      .reduce((n, a) => n + (num(a.value) || 0), 0);
    rows.push({
      id: String(ad.id), name: String(ad.name || ''), status: String(ad.effective_status || ''),
      thumb_url: (creative.thumbnail_url as string) || null,
      post_id: story || (creative.source_instagram_media_id as string) || null,
      permalink: (creative.instagram_permalink_url as string) || (story ? `https://www.facebook.com/${story}` : null),
      spend: num(ins.spend) || 0, impressions: num(ins.impressions) || 0, reach: num(ins.reach) || 0,
      clicks: num(ins.inline_link_clicks) ?? num(ins.clicks) ?? 0, results,
    });
  }
  return rows.sort((a, b) => b.spend - a.spend);
}
