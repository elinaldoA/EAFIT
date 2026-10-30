// Marketing (painel → Marketing): conversa com as APIs oficiais da Meta
// (Graph API para Página do Facebook e Instagram profissional; Threads API).
// Usado por marketing-oauth (conectar contas) e marketing (publicar,
// comentários, renovar token). O fetch é injetado para os testes.
//
// Tokens nunca saem do servidor: ficam em public.marketing_tokens cifrados com
// AES-GCM (chave derivada do secret MARKETING_TOKEN_KEY).

// Cada versão da Graph API vale ~2 anos; ao trocar, conferir o changelog da Meta.
export const GRAPH_VERSION = 'v23.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const THREADS_BASE = 'https://graph.threads.net/v1.0';

export type Platform = 'facebook' | 'instagram' | 'threads';
export type Media = { type: 'image' | 'video'; url: string; credit?: string };
export type Account = { id: string; platform: Platform; external_id: string; username?: string | null };
export type Post = { id: string; caption: string; media: Media[] };

// Permissões pedidas no login. Com as contas da própria EAFIT e quem conecta
// com papel no app da Meta, o "acesso padrão" basta (sem App Review).
export const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement',
  'pages_read_user_content', 'business_management',
  'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_contents',
];
export const THREADS_SCOPES = [
  'threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_read_replies', 'threads_delete',
];

export const CAPTION_LIMITS: Record<Platform, number> = { facebook: 63000, instagram: 2200, threads: 500 };

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

export type OAuthState = { admin: string; provider: 'meta' | 'threads'; origin: string; exp: number };

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
  };
}

export function baseFor(platform: Platform): string {
  return platform === 'threads' ? THREADS_BASE : GRAPH_BASE;
}

// ---------- publicação ----------

// O que a rede aceita deste post (o painel já valida; aqui é a última barreira).
export function checkPost(platform: Platform, post: Post): string | null {
  const videos = post.media.filter((m) => m.type === 'video').length;
  if (post.caption.length > CAPTION_LIMITS[platform]) return `Legenda passa de ${CAPTION_LIMITS[platform]} caracteres.`;
  if (videos > 1 || (videos === 1 && post.media.length > 1)) return 'Vídeo vai sozinho no post.';
  if (platform === 'instagram' && !post.media.length) return 'Instagram exige ao menos uma imagem ou vídeo.';
  if (!post.caption.trim() && !post.media.length) return 'Post vazio.';
  return null;
}

export type Step =
  | { state: 'published'; externalId: string; permalink: string | null }
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

async function createInstagramContainer(api: Api, account: Account, post: Post): Promise<string> {
  const ig = account.external_id;
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

async function createThreadsContainer(api: Api, account: Account, post: Post): Promise<string> {
  const uid = account.external_id;
  const item = (m: Media) => (m.type === 'video' ? { media_type: 'VIDEO', video_url: m.url } : { media_type: 'IMAGE', image_url: m.url });
  if (post.media.length <= 1) {
    const params = post.media.length ? { ...item(post.media[0]), text: post.caption } : { media_type: 'TEXT', text: post.caption };
    return String((await api.post(`/${uid}/threads`, params)).id);
  }
  const children: string[] = [];
  for (const m of post.media) children.push(String((await api.post(`/${uid}/threads`, { ...item(m), is_carousel_item: true })).id));
  return String((await api.post(`/${uid}/threads`, { media_type: 'CAROUSEL', children: children.join(','), text: post.caption })).id);
}

// Instagram e Threads publicam em duas etapas: cria o container, espera a rede
// processar a mídia (vídeo pode levar minutos) e publica. Facebook é direto.
export async function startPublish(api: Api, account: Account, post: Post): Promise<Step> {
  if (account.platform === 'facebook') return publishFacebook(api, account, post);
  const containerId = account.platform === 'instagram'
    ? await createInstagramContainer(api, account, post)
    : await createThreadsContainer(api, account, post);
  return continuePublish(api, account, post, containerId);
}

export async function continuePublish(api: Api, account: Account, post: Post, containerId: string): Promise<Step> {
  const isIg = account.platform === 'instagram';
  const data = await api.get(`/${containerId}`, { fields: isIg ? 'status_code,status' : 'status,error_message' });
  const status = String((isIg ? data.status_code : data.status) || '');
  if (status === 'ERROR' || status === 'EXPIRED') {
    throw new GraphError(`A rede recusou a mídia (${String(data.error_message || data.status || status)}).`);
  }
  if (status !== 'FINISHED' && status !== 'PUBLISHED') {
    const hasVideo = post.media.some((m) => m.type === 'video');
    return { state: 'processing', containerId, retryInSec: hasVideo ? 30 : 10 };
  }
  const path = isIg ? `/${account.external_id}/media_publish` : `/${account.external_id}/threads_publish`;
  const id = String((await api.post(path, { creation_id: containerId })).id);
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
  } else {
    const threads = await api.get(`/${account.external_id}/threads`, { fields: 'id,text,permalink', limit: 10 });
    for (const t of list(threads)) {
      const convo = list(await api.get(`/${t.id}/conversation`, {
        fields: 'id,text,username,timestamp,hide_status,replied_to,is_reply_owned_by_me',
        reverse: false,
      }));
      const mine = (r: Obj) => r.is_reply_owned_by_me === true || String(r.username || '').toLowerCase() === own;
      for (const c of convo) {
        if ((c.replied_to as Obj | undefined)?.id !== t.id || mine(c)) continue;
        rows.push({
          external_id: String(c.id), post_external_id: String(t.id), post_permalink: (t.permalink as string) || null,
          post_caption: String(t.text || ''), author: `@${String(c.username || '')}`, text: String(c.text || ''),
          commented_at: (c.timestamp as string) || null, hidden: String(c.hide_status || '') === 'HIDDEN',
          answered: convo.some((r) => (r.replied_to as Obj | undefined)?.id === c.id && mine(r)),
        });
      }
    }
  }
  return rows;
}

export async function replyToComment(api: Api, account: Account, commentId: string, text: string): Promise<string> {
  if (account.platform === 'facebook') return String((await api.post(`/${commentId}/comments`, { message: text })).id);
  if (account.platform === 'instagram') return String((await api.post(`/${commentId}/replies`, { message: text })).id);
  const uid = account.external_id;
  const container = String((await api.post(`/${uid}/threads`, { media_type: 'TEXT', text, reply_to_id: commentId })).id);
  return String((await api.post(`/${uid}/threads_publish`, { creation_id: container })).id);
}

export async function setCommentHidden(api: Api, account: Account, commentId: string, hidden: boolean): Promise<void> {
  if (account.platform === 'facebook') await api.post(`/${commentId}`, { is_hidden: hidden });
  else if (account.platform === 'instagram') await api.post(`/${commentId}`, { hide: hidden });
  else await api.post(`/${commentId}/manage_reply`, { hide: hidden });
}

// ---------- exclusão ----------

// Apaga o post publicado na rede (Facebook: pages_manage_posts; Instagram:
// instagram_manage_contents; Threads: threads_delete). Se ele já não existe
// lá (apagado direto na rede), conta como apagado.
export async function deletePublished(api: Api, externalId: string): Promise<void> {
  try {
    await api.del(`/${externalId}`);
  } catch (err) {
    if (err instanceof GraphError && err.isGone) return;
    throw err;
  }
}
