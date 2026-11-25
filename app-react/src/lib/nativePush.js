import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from './supabase';
import { goTo } from './appNav';
import { NAV_TARGETS, pushTargetKey } from './pushTarget';
import { PUSH_EVENT_URL } from './pushEvents';
import { isNative } from './native';
import { reportError } from './errorReporter';

// Push do servidor no app Android (FCM). O token do aparelho é guardado em
// push_subscriptions com endpoint 'fcm:<token>' (RPC push_register_fcm), e as
// Edge Functions que já enviam web push passam a alcançá-lo (ver
// supabase/functions/_shared/fcm.ts). No navegador/PWA nada disto roda.

const TOKEN_KEY = 'eafit_fcm_token';
// Mesmo id usado no envio (_shared/fcm.ts, FCM_CHANNEL).
export const CHANNEL_ID = 'eafit_default';
const REGISTRATION_TIMEOUT_MS = 15000;

let listening = false;
let waiters = [];
let lastFailure = '';
let lastRegistrationError = '';

// Por que o último registro no FCM não deu (para a mensagem na tela e para o
// painel de erros): sem isso, uma falha aqui é silenciosa e o app só cai nos
// lembretes locais.
export function getLastPushFailure() {
  return lastFailure;
}

// Situação do push neste aparelho, para a tela do Perfil: 'active' (token
// registrado), 'failed' (motivo em getLastPushFailure) ou 'unknown' (ainda não tentou).
export function getPushStatus() {
  if (lastFailure) return 'failed';
  return getStoredFcmToken() ? 'active' : 'unknown';
}

function fail(step, detail) {
  const text = typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail) || '');
  lastFailure = `${step}${text ? `: ${text}` : ''}`.slice(0, 160);
  // kind 'error': client_errors só aceita error/unhandledrejection/boundary.
  reportError('error', new Error(`FCM ${lastFailure}`));
  return null;
}

export function getStoredFcmToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function storeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* sem storage */ }
}

// Conta no servidor o recebimento/toque de um envio do backoffice (campanha).
// Melhor esforço, como no service worker (lib/pushEvents.js).
export async function reportNativePushEvent(campaign, event, fetchFn = fetch) {
  const token = getStoredFcmToken();
  if (!campaign || !token) return;
  try {
    await fetchFn(PUSH_EVENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: `fcm:${token}`, campaign, event }),
      keepalive: true,
    });
  } catch { /* sem rede: o evento não é contado */ }
}

// Toque no aviso: abre a tela do assunto (pela tag, como no service worker).
function openTarget(data, title) {
  const target = pushTargetKey({ tag: data?.tag, title });
  goTo(NAV_TARGETS[target], { replace: true });
}

// Escuta o que chega do FCM. Chamar uma vez, o quanto antes (main.jsx): um
// toque que abriu o app do zero é entregue assim que o ouvinte existe.
export function initNativePush() {
  if (!isNative() || listening) return;
  listening = true;

  PushNotifications.addListener('registration', ({ value }) => {
    const pending = waiters;
    waiters = [];
    pending.forEach(resolve => resolve(value));
  }).catch(() => {});
  PushNotifications.addListener('registrationError', err => {
    console.error('push registrationError:', err);
    lastRegistrationError = err?.error || err?.message || '';
    const pending = waiters;
    waiters = [];
    pending.forEach(resolve => resolve(null));
  }).catch(() => {});

  // Com o app aberto o Android não mostra o aviso sozinho: mostra como notificação local.
  PushNotifications.addListener('pushNotificationReceived', notification => {
    reportNativePushEvent(notification.data?.campaign, 'received');
    LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2_000_000_000),
        title: notification.title || '',
        body: notification.body || '',
        extra: notification.data || {},
        isExactNotification: false,
      }],
    }).catch(() => {});
  }).catch(() => {});

  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    reportNativePushEvent(notification.data?.campaign, 'clicked');
    openTarget(notification.data, notification.title);
  }).catch(() => {});
  // Toque no aviso que o app mesmo mostrou (aberto no primeiro plano).
  LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    if (notification.extra?.tag) {
      reportNativePushEvent(notification.extra.campaign, 'clicked');
      openTarget(notification.extra, notification.title);
    }
  }).catch(() => {});
}

function waitForToken() {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      waiters = waiters.filter(w => w !== done);
      resolve(null);
    }, REGISTRATION_TIMEOUT_MS);
    function done(value) { clearTimeout(timer); resolve(value); }
    waiters.push(done);
  });
}

// Registra o aparelho no FCM e guarda o token na conta. Devolve o token, ou
// null se não deu (sem permissão, sem Google Play Services, sem google-services.json
// no build, sem rede): quem chama cai nos lembretes locais.
export async function registerNativePush() {
  if (!isNative()) return null;
  initNativePush();
  try {
    let { receive } = await PushNotifications.checkPermissions();
    if (receive === 'prompt' || receive === 'prompt-with-rationale') ({ receive } = await PushNotifications.requestPermissions());
    if (receive !== 'granted') return fail('permissão', receive);

    await PushNotifications.createChannel({
      id: CHANNEL_ID, name: 'Avisos', description: 'Lembretes, avisos e novidades do EAFIT', importance: 4, visibility: 1, vibration: true,
    }).catch(() => {});

    lastRegistrationError = '';
    const tokenPromise = waitForToken();
    await PushNotifications.register();
    const token = await tokenPromise;
    if (!token) return fail('token', lastRegistrationError || 'o Firebase não respondeu');

    const { error } = await db.rpc('push_register_fcm', { p_token: token });
    if (error) return fail('salvar', error);
    lastFailure = '';
    storeToken(token);
    return token;
  } catch (err) {
    console.error('registerNativePush:', err);
    return fail('registro', err);
  }
}

// Desliga os avisos neste aparelho: tira o token da conta e do FCM.
export async function unregisterNativePush() {
  const token = getStoredFcmToken();
  storeToken('');
  if (!isNative()) return;
  try {
    if (token) await db.from('push_subscriptions').delete().eq('endpoint', `fcm:${token}`);
    await PushNotifications.unregister();
  } catch (err) {
    console.error('unregisterNativePush:', err);
  }
}
