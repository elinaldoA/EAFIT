import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { EMAIL_LINK_TYPES } from './emailLink';

// Login no app Android (Capacitor). Dentro do app o endereço é https://localhost,
// então o que sai para fora (Google, e-mails) usa endereços próprios:
//  - Google: o Google bloqueia login em WebView, então abre no navegador do
//    sistema (Chrome Custom Tab) e volta pelo esquema br.com.eafit.app://auth
//    (intent-filter no AndroidManifest). Esse endereço precisa estar em
//    Authentication → URL Configuration → Redirect URLs no Supabase.
//  - E-mails: os links continuam https://eafit.com.br/app/?token_hash=...;
//    o Android os entrega ao app (App Links) quando ele está instalado.
export const NATIVE_REDIRECT = 'br.com.eafit.app://auth';
export const WEB_APP_URL = 'https://eafit.com.br/app/';
const SCHEME = 'br.com.eafit.app:';

// Interpreta um endereço que abriu o app. Devolve
// { kind: 'oauth', code } | { kind: 'error', message } | { kind: 'email', token_hash, type } | null.
export function parseAuthUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol === SCHEME) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const get = key => url.searchParams.get(key) || hash.get(key);
    const message = get('error_description') || get('error');
    if (message) return { kind: 'error', message };
    const code = get('code');
    return code ? { kind: 'oauth', code } : null;
  }
  if (url.origin === new URL(WEB_APP_URL).origin && url.pathname.startsWith('/app')) {
    const token_hash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    if (token_hash && EMAIL_LINK_TYPES.includes(type)) return { kind: 'email', token_hash, type };
  }
  return null;
}

// Abre o login do Google no navegador do sistema. A volta chega por
// listenNativeAuthUrls. Devolve { error } se não deu para começar.
export async function startNativeGoogleLogin(db) {
  const { data, error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { error: error || new Error('sem endereço de login') };
  try { await Browser.open({ url: data.url }); } catch (e) { return { error: e }; }
  return {};
}

// Chama onUrl(endereço) para cada endereço que abre o app: com o app já aberto
// (appUrlOpen) e o que o abriu do zero (getLaunchUrl). O mesmo endereço não
// passa duas vezes. Devolve a função que para de ouvir.
export function listenNativeAuthUrls(onUrl) {
  let stopped = false;
  let handle = null;
  const seen = new Set();
  const fire = url => {
    if (stopped || !url || seen.has(url)) return;
    seen.add(url);
    onUrl(url);
  };
  App.addListener('appUrlOpen', event => fire(event?.url)).then(h => {
    if (stopped) h.remove(); else handle = h;
  }).catch(() => {});
  App.getLaunchUrl().then(result => fire(result?.url)).catch(() => {});
  return () => { stopped = true; handle?.remove(); };
}

// No Android o Custom Tab fecha sozinho ao voltar para o app; no iOS precisa fechar.
export function closeAuthBrowser() {
  return Browser.close().catch(() => {});
}
