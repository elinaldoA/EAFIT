// TikTok (painel → Marketing): Login Kit + Content Posting API (Direct Post).
// Usado por marketing-oauth (conectar) e marketing (publicar, renovar acesso).
//
// Diferenças em relação à Meta:
//   - o acesso vale 24 h e é renovado com o refresh token (vale 1 ano): o que
//     fica cifrado em marketing_tokens é um JSON { access, refresh, accessExp };
//   - toda resposta traz error.code ('ok' = sucesso);
//   - só vídeo: o arquivo vai do servidor para o TikTok em partes (FILE_UPLOAD),
//     sem precisar verificar o domínio da URL da mídia;
//   - não há API de comentários nem de exclusão para esta conta.
// Enquanto o app não passa pela auditoria do TikTok, ele só posta como privado
// (SELF_ONLY); com TIKTOK_PUBLIC_POSTS=true os posts saem públicos.
import { GraphError, type Post, type Step } from './marketing.ts';

export const TIKTOK_API = 'https://open.tiktokapis.com/v2';
export const TIKTOK_AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_SCOPES = ['user.info.basic', 'user.info.profile', 'video.publish'];

// Erros que só se resolvem conectando de novo (viram o código 190 da Meta).
const RECONNECT_CODES = ['access_token_invalid', 'scope_not_authorized', 'invalid_grant', 'invalid_token'];

type FetchFn = typeof fetch;
type Obj = Record<string, unknown>;

export type TikTokToken = { access: string; refresh: string; accessExp: number };

export function tokenFromOAuth(r: Obj, now = Date.now()): TikTokToken {
  return {
    access: String(r.access_token),
    refresh: String(r.refresh_token),
    accessExp: now + Number(r.expires_in || 86_400) * 1000,
  };
}

export function parseToken(stored: string): TikTokToken {
  const t = JSON.parse(stored) as TikTokToken;
  if (!t.access || !t.refresh) throw new Error('Acesso do TikTok incompleto: reconecte em Marketing → Contas.');
  return t;
}

// Troca de código e renovação (form-urlencoded; erro vem em error/error_description).
export async function oauthToken(fetchFn: FetchFn, params: Record<string, string>): Promise<Obj> {
  const res = await fetchFn(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({})) as Obj;
  if (!res.ok || data.error || !data.access_token) {
    const code = String(data.error || '');
    throw new GraphError(String(data.error_description || code || `HTTP ${res.status}`), RECONNECT_CODES.includes(code) ? 190 : 0);
  }
  return data;
}

export type TikTokApi = {
  get: (path: string, params?: Record<string, string>) => Promise<Obj>;
  post: (path: string, body?: Obj) => Promise<Obj>;
};

async function parse(res: Response): Promise<Obj> {
  const body = await res.json().catch(() => ({})) as Obj;
  const err = body.error as { code?: string; message?: string } | undefined;
  if (!res.ok || (err?.code && err.code !== 'ok')) {
    const code = String(err?.code || '');
    // O código diz o motivo; a mensagem às vezes é só um link genérico.
    const msg = [err?.message, code && `(${code})`].filter(Boolean).join(' ');
    throw new GraphError(msg || `HTTP ${res.status}`, RECONNECT_CODES.includes(code) ? 190 : 0);
  }
  return (body.data || {}) as Obj;
}

export function makeTikTokApi(fetchFn: FetchFn, accessToken: string): TikTokApi {
  const auth = { Authorization: `Bearer ${accessToken}` };
  return {
    get: async (path, params = {}) => parse(await fetchFn(`${TIKTOK_API}${path}?${new URLSearchParams(params)}`, { headers: auth })),
    post: async (path, body = {}) => parse(await fetchFn(`${TIKTOK_API}${path}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    })),
  };
}

// Até 64 MB vai numa parte só; acima, partes de 10 MB e a última leva o resto
// (regra do TikTok: parte entre 5 e 64 MB, a última até 128 MB).
const MB = 1024 * 1024;
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

// Baixa o vídeo da biblioteca, abre a postagem e envia as partes. O TikTok
// processa depois: o publish_id faz o papel do container da Meta.
export async function startTikTok(api: TikTokApi, fetchFn: FetchFn, post: Post, publicPosts: boolean): Promise<Step> {
  const media = post.media[0];
  const file = await fetchFn(media.url);
  if (!file.ok) throw new Error(`Não deu para baixar o vídeo da biblioteca (HTTP ${file.status}).`);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const creator = await api.post('/post/publish/creator_info/query/');
  const options = (creator.privacy_level_options as string[] | undefined) || [];
  const privacy = publicPosts && options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';

  const { chunkSize, count } = chunkPlan(bytes.length);
  const init = await api.post('/post/publish/video/init/', {
    post_info: {
      title: post.caption,
      privacy_level: privacy,
      disable_comment: false,
      disable_duet: false,
      disable_stitch: false,
      brand_content_toggle: false,
      brand_organic_toggle: true, // divulga a própria EAFIT
    },
    source_info: { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: chunkSize, total_chunk_count: count },
  });

  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? bytes.length : start + chunkSize;
    const res = await fetchFn(String(init.upload_url), {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end - 1}/${bytes.length}` },
      body: bytes.slice(start, end),
    });
    if (!res.ok) throw new Error(`O TikTok recusou o envio do vídeo (parte ${i + 1}, HTTP ${res.status}).`);
  }
  return { state: 'processing', containerId: String(init.publish_id), retryInSec: 15 };
}

export async function continueTikTok(api: TikTokApi, username: string | null | undefined, publishId: string, publicPosts: boolean): Promise<Step> {
  const s = await api.post('/post/publish/status/fetch/', { publish_id: publishId });
  const status = String(s.status || '');
  if (status === 'FAILED') throw new GraphError(`O TikTok recusou o vídeo (${String(s.fail_reason || 'sem motivo')}).`);
  if (status !== 'PUBLISH_COMPLETE') return { state: 'processing', containerId: publishId, retryInSec: 15 };
  const ids = (s.publicaly_available_post_id as (string | number)[] | undefined) || [];
  const postId = ids.length ? String(ids[0]) : '';
  return {
    state: 'published',
    externalId: postId || publishId,
    permalink: postId && username ? `https://www.tiktok.com/@${username}/video/${postId}` : null,
    note: publicPosts ? undefined : 'Saiu como privado (o app do TikTok ainda não foi auditado): abra o vídeo no TikTok e mude para Público.',
  };
}
