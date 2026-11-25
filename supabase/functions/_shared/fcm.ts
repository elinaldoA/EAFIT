// Envio de push para o app Android (FCM, HTTP v1). O app registra o token do
// aparelho na mesma tabela das inscrições web (push_subscriptions) com
// endpoint = 'fcm:<token>' (RPC push_register_fcm), então todas as funções que
// já leem essa tabela e chamam sendWebPush (_shared/webpush.ts) passam a
// alcançar o app sem mudança: o helper vê o prefixo e envia por aqui.
//
// Secret necessário: FCM_SERVICE_ACCOUNT = JSON da chave da conta de serviço
// (Firebase → Configurações do projeto → Contas de serviço → Gerar nova chave).

export const FCM_PREFIX = 'fcm:';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
// Canal de notificação criado pelo app (lib/nativePush.js): o mesmo id aqui.
export const FCM_CHANNEL = 'eafit_default';

export type FcmPayload = { title: string; body: string; tag?: string; url?: string; campaign?: string };
type ServiceAccount = { client_email: string; private_key: string; project_id: string; token_uri?: string };

export function isFcmEndpoint(endpoint: string): boolean {
  return typeof endpoint === 'string' && endpoint.startsWith(FCM_PREFIX);
}

export function fcmTokenOf(endpoint: string): string {
  return endpoint.slice(FCM_PREFIX.length);
}

// Corpo da mensagem. `notification` faz o sistema mostrar o aviso com o app
// fechado; `data` (só strings) volta ao app no toque, para navegar e contar a
// campanha. `tag` substitui o aviso anterior com a mesma tag, como no web push.
export function buildFcmMessage(token: string, payload: FcmPayload) {
  const data: Record<string, string> = {};
  if (payload.tag) data.tag = payload.tag;
  if (payload.url) data.url = payload.url;
  if (payload.campaign) data.campaign = payload.campaign;
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data,
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: FCM_CHANNEL,
          ...(payload.tag ? { tag: payload.tag } : {}),
        },
      },
    },
  };
}

// 'stale' = token que não existe mais (app desinstalado, dados limpos): o
// chamador apaga a linha. Outras falhas só são logadas.
export function classifyFcmError(status: number, body: unknown): 'stale' | 'error' {
  if (status === 404) return 'stale';
  const err = (body as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } })?.error;
  if (err?.details?.some((d) => d?.errorCode === 'UNREGISTERED')) return 'stale';
  if (status === 400 && err?.status === 'INVALID_ARGUMENT' && /registration token/i.test(err?.message || '')) return 'stale';
  return 'error';
}

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

// JWT RS256 que a conta de serviço troca por um access token do Google.
export async function signServiceAccountJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

let cached: { token: string; expiresAt: number } | null = null;

export function resetFcmTokenCache() {
  cached = null;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    return sa?.client_email && sa?.private_key && sa?.project_id ? sa : null;
  } catch {
    return null;
  }
}

async function getAccessToken(sa: ServiceAccount, fetchFn: typeof fetch): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;
  const assertion = await signServiceAccountJwt(sa, Math.floor(now / 1000));
  const res = await fetchFn(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`FCM auth falhou (${res.status})`);
  cached = { token: json.access_token, expiresAt: now + (Number(json.expires_in) || 3600) * 1000 };
  return cached.token;
}

// Envia para um token do app. 'sent' | 'stale' (apagar a linha) | 'error'.
export async function sendFcm(
  endpoint: string,
  payload: FcmPayload,
  fetchFn: typeof fetch = fetch,
): Promise<'sent' | 'stale' | 'error'> {
  const sa = loadServiceAccount();
  if (!sa) {
    console.error('sendFcm: secret FCM_SERVICE_ACCOUNT ausente ou inválido');
    return 'error';
  }
  try {
    const accessToken = await getAccessToken(sa, fetchFn);
    const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFcmMessage(fcmTokenOf(endpoint), payload)),
    });
    if (res.ok) return 'sent';
    const body = await res.json().catch(() => ({}));
    const kind = classifyFcmError(res.status, body);
    if (kind === 'error') console.error('sendFcm error:', res.status, JSON.stringify(body));
    return kind;
  } catch (err) {
    console.error('sendFcm error:', err);
    return 'error';
  }
}
