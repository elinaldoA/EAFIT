// YouTube (painel → Marketing): Google OAuth + YouTube Data API v3 (videos.insert).
// Usado por marketing-oauth (conectar) e marketing (publicar, apagar, renovar acesso).
//
// Diferenças em relação à Meta e ao TikTok:
//   - o acesso vale 1 h e é renovado com o refresh token do Google, que não
//     vence sozinho (só se for revogado ou ficar 6 meses sem uso; e, com a tela
//     de consentimento em "Teste", vence em 7 dias: publique o app no Google
//     Cloud). O que fica cifrado em marketing_tokens é um JSON
//     { access, refresh, accessExp };
//   - o vídeo vai do servidor para o YouTube num upload resumível: o videoId
//     volta na hora, então não há etapa de "processando" como no TikTok;
//   - vídeo vertical de até 3 min vira Short sozinho;
//   - sem a auditoria do projeto pelo Google, todo vídeo enviado pela API fica
//     travado como privado. Com YOUTUBE_PUBLIC_POSTS=true saem públicos.
import { GraphError, type Post, type Step } from './marketing.ts';

export const YOUTUBE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
export const YOUTUBE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
// Um escopo só: publicar, apagar e ler o canal.
export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube'];

export const TITLE_LIMIT = 100;
export const DESCRIPTION_LIMIT = 5000;

// Erros que só se resolvem conectando de novo (viram o código 190 da Meta).
const RECONNECT_CODES = ['invalid_grant', 'invalid_token', 'unauthorized_client', 'authError'];

type FetchFn = typeof fetch;
type Obj = Record<string, unknown>;

export type YouTubeToken = { access: string; refresh: string; accessExp: number };

// refresh: no login vem junto; na renovação o Google não manda outro, vale o antigo.
export function tokenFromOAuth(r: Obj, now = Date.now(), previousRefresh = ''): YouTubeToken {
  const refresh = String(r.refresh_token || previousRefresh || '');
  if (!r.access_token || !refresh) {
    throw new GraphError('O Google não devolveu o acesso offline. Remova o app em myaccount.google.com/permissions e conecte de novo.', 190);
  }
  return { access: String(r.access_token), refresh, accessExp: now + Number(r.expires_in || 3600) * 1000 };
}

export function parseToken(stored: string): YouTubeToken {
  const t = JSON.parse(stored) as YouTubeToken;
  if (!t.access || !t.refresh) throw new Error('Acesso do YouTube incompleto: reconecte em Marketing → Contas.');
  return t;
}

// Troca de código e renovação (form-urlencoded; erro vem em error/error_description).
export async function oauthToken(fetchFn: FetchFn, params: Record<string, string>): Promise<Obj> {
  const res = await fetchFn(YOUTUBE_TOKEN_URL, {
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

// Erros da Data API: { error: { code, message, errors: [{ reason }] } }.
const REASONS: Record<string, string> = {
  quotaExceeded: 'A cota diária do YouTube acabou (volta à meia-noite, horário do Pacífico).',
  uploadLimitExceeded: 'O canal atingiu o limite de envios por hoje. Verifique o canal em youtube.com/verify e tente amanhã.',
  forbidden: 'O YouTube não autorizou a ação neste canal.',
  youtubeSignupRequired: 'A conta do Google não tem canal no YouTube.',
  videoTooLong: 'O vídeo passa do limite do canal (verifique o canal em youtube.com/verify para vídeos longos).',
};

export async function parseError(res: Response): Promise<GraphError> {
  const body = await res.json().catch(() => ({})) as { error?: { message?: string; errors?: { reason?: string }[] } };
  const reason = String(body.error?.errors?.[0]?.reason || '');
  const msg = REASONS[reason] || [body.error?.message, reason && `(${reason})`].filter(Boolean).join(' ') || `HTTP ${res.status}`;
  return new GraphError(msg, res.status === 401 || RECONNECT_CODES.includes(reason) ? 190 : 0);
}

async function getJson(fetchFn: FetchFn, accessToken: string, path: string, params: Record<string, string>): Promise<Obj> {
  const res = await fetchFn(`${YOUTUBE_API}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await parseError(res);
  return await res.json() as Obj;
}

export type YouTubeChannel = { id: string; title: string; handle: string | null; pictureUrl: string | null };

// Canal da conta que fez o login. Sem canal, o Google devolve a lista vazia.
export async function myChannel(fetchFn: FetchFn, accessToken: string): Promise<YouTubeChannel> {
  const data = await getJson(fetchFn, accessToken, '/channels', { part: 'snippet', mine: 'true' });
  const item = ((data.items as Obj[] | undefined) || [])[0];
  if (!item) throw new GraphError('Esta conta do Google não tem canal no YouTube. Crie o canal e conecte de novo.');
  const sn = (item.snippet || {}) as { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
  return {
    id: String(item.id),
    title: sn.title || 'YouTube',
    handle: sn.customUrl ? String(sn.customUrl).replace(/^@/, '') : null,
    pictureUrl: sn.thumbnails?.default?.url || null,
  };
}

// Título = primeira linha da legenda (o YouTube exige um e limita a 100, sem < >);
// descrição = a legenda inteira. A legenda vem com os créditos de mídia no fim.
export function videoText(caption: string): { title: string; description: string } {
  const clean = (s: string) => s.replace(/[<>]/g, '').trim();
  const text = clean(String(caption || '').replace(/\r/g, ''));
  const first = clean(text.split('\n').find((l) => l.trim()) || '');
  let title = first.length > TITLE_LIMIT ? `${first.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : first;
  if (!title) title = 'EAFIT App';
  return { title, description: text.slice(0, DESCRIPTION_LIMIT) };
}

export function snippetAndStatus(post: Post, publicPosts: boolean): Obj {
  const { title, description } = videoText(post.caption);
  return {
    snippet: { title, description, categoryId: '17' }, // 17 = Esportes
    status: { privacyStatus: publicPosts ? 'public' : 'private', selfDeclaredMadeForKids: false },
  };
}

// Baixa o vídeo da biblioteca e envia pelo upload resumível (uma parte só: o
// bucket limita o arquivo a 100 MB). O videoId volta na hora.
export async function publishYouTube(accessToken: string, fetchFn: FetchFn, post: Post, publicPosts: boolean): Promise<Step> {
  const media = post.media[0];
  const file = await fetchFn(media.url);
  if (!file.ok) throw new Error(`Não deu para baixar o vídeo da biblioteca (HTTP ${file.status}).`);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const init = await fetchFn(`${YOUTUBE_UPLOAD}?${new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status' })}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(bytes.length),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(snippetAndStatus(post, publicPosts)),
  });
  if (!init.ok) throw await parseError(init);
  const location = init.headers.get('Location');
  if (!location) throw new Error('O YouTube não devolveu o endereço de envio do vídeo.');

  const up = await fetchFn(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: bytes,
  });
  if (!up.ok) throw await parseError(up);
  const video = await up.json().catch(() => ({})) as { id?: string; status?: { privacyStatus?: string } };
  if (!video.id) throw new Error('O YouTube recebeu o vídeo mas não devolveu o id.');

  let note: string | undefined;
  if (!publicPosts) note = 'Saiu como privado (o projeto do Google ainda não foi auditado): abra o vídeo no YouTube Studio e mude para Público.';
  else if (video.status?.privacyStatus === 'private') note = 'O YouTube deixou o vídeo privado: confira em YouTube Studio → Conteúdo.';
  return { state: 'published', externalId: video.id, permalink: `https://www.youtube.com/watch?v=${video.id}`, note };
}

// 204 = apagado; 404 = já não existe (apagado direto no YouTube): conta como feito.
export async function deleteYouTube(accessToken: string, fetchFn: FetchFn, videoId: string): Promise<void> {
  const res = await fetchFn(`${YOUTUBE_API}/videos?${new URLSearchParams({ id: videoId })}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return;
  if (!res.ok) throw await parseError(res);
}
