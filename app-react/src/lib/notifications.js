import { t } from './i18n';
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// No iOS Safari, notificações (inclusive push) só existem depois de instalar
// o app na tela de início (iOS 16.4+) — abrir pelo Safari normal nunca terá
// `Notification` no `window`, então vale avisar o motivo em vez de só dizer
// "não suportado".
export function isIosSafariNotInstalled() {
  if (typeof navigator === 'undefined') return false;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  return isIos && !isStandalone;
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

// Preferências novas (streak, inatividade, resumo semanal, recordes) são opt-out: um
// campo ausente em user_metadata (usuário que já tinha o switch mestre ligado antes
// dessas preferências existirem) conta como ligado.
export function isNotifyEnabled(meta, key) {
  return meta?.[key] !== false;
}

export async function sendNotification(title, options) {
  if (!isNotificationSupported()) throw new Error(t('Notificações não suportadas neste navegador'));
  if (Notification.permission !== 'granted') throw new Error(t('Permissão de notificação: {permission}', { permission: Notification.permission }));

  // Pages controlled by a service worker (this app is a PWA) can't use
  // `new Notification()` in Chrome/Edge — it throws "Illegal constructor".
  // Route through the SW registration instead when one is active.
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  }
  new Notification(title, options);
}
