import { Capacitor } from '@capacitor/core';

// Rodando dentro do app nativo (Capacitor) e não no navegador/PWA.
export function isNative() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}
