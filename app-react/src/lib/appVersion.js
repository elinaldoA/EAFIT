import { version as APP_VERSION } from '../../package.json';

export { APP_VERSION };

// "1.4.10" × "1.4.2" por partes numéricas (o que faltar conta como 0).
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map(n => Number(n) || 0);
  const pb = String(b || '').split('.').map(n => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Este aparelho está abaixo da versão mínima definida no painel?
export function isOutdated(minVersion, current = APP_VERSION) {
  return !!minVersion && compareVersions(current, minVersion) < 0;
}

// Atualização forçada: tira o service worker e os caches (o PWA às vezes fica
// preso numa versão antiga) e recarrega do servidor.
export async function hardUpdate(win = window) {
  try {
    const regs = (await win.navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map(r => r.unregister().catch(() => false)));
  } catch { /* sem service worker */ }
  try {
    const keys = (await win.caches?.keys?.()) || [];
    await Promise.all(keys.map(k => win.caches.delete(k)));
  } catch { /* sem Cache Storage */ }
  win.location.reload();
}
