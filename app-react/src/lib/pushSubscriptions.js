import { db } from './supabase';

import { t } from './i18n';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// Cria (ou reaproveita) uma inscrição push do navegador e salva no Supabase,
// para que o servidor consiga notificar este dispositivo com o app fechado.
export async function subscribeToPush(userId) {
  if (!isPushSupported()) throw new Error(t('Notificações push não suportadas neste navegador.'));
  if (!VAPID_PUBLIC_KEY) throw new Error(t('Push não configurado (VITE_VAPID_PUBLIC_KEY ausente).'));

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const { error } = await db.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
  return sub;
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  if (error) throw error;
  await sub.unsubscribe();
}

// Push imediato (chega mesmo com o app fechado/em outro dispositivo), diferente de
// sendNotification() em lib/notifications.js que só funciona com a aba aberta. Usado
// pra eventos pontuais (PR, conquista) — a Edge Function send-push identifica o
// usuário pelo token da sessão atual, então não precisa (nem deve) passar user_id aqui.
export async function sendPushToSelf({ title, body, tag }) {
  const { error } = await db.functions.invoke('send-push', { body: { title, body, tag } });
  if (error) throw error;
}
