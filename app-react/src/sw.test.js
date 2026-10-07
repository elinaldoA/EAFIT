// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const wb = vi.hoisted(() => ({
  clientsClaim: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  precacheAndRoute: vi.fn(),
  registerRoute: vi.fn(),
  CacheFirst: vi.fn(class { constructor(opts) { this.opts = opts; } }),
  ExpirationPlugin: vi.fn(class { constructor(opts) { this.opts = opts; } }),
}));

vi.mock('workbox-precaching', () => ({ cleanupOutdatedCaches: wb.cleanupOutdatedCaches, precacheAndRoute: wb.precacheAndRoute }));
vi.mock('workbox-core', () => ({ clientsClaim: wb.clientsClaim }));
vi.mock('workbox-routing', () => ({ registerRoute: wb.registerRoute }));
vi.mock('workbox-strategies', () => ({ CacheFirst: wb.CacheFirst }));
vi.mock('workbox-expiration', () => ({ ExpirationPlugin: wb.ExpirationPlugin }));

const listeners = {};
let registration;
let clientsApi;

async function loadSw() {
  vi.resetModules();
  Object.keys(listeners).forEach(k => delete listeners[k]);
  registration = { showNotification: vi.fn().mockResolvedValue() };
  clientsApi = { matchAll: vi.fn(), openWindow: vi.fn().mockResolvedValue() };
  globalThis.self = Object.assign(globalThis, {
    __WB_MANIFEST: [{ url: 'index.html' }],
    location: { origin: 'https://app.test' },
    registration,
    clients: clientsApi,
    skipWaiting: vi.fn(),
    navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  });
  await import('./sw.js');
}

const pushEvent = data => {
  const waits = [];
  const event = {
    data: data === undefined ? null : { json: () => (typeof data === 'function' ? data() : data), text: () => 'texto cru' },
    waitUntil: p => waits.push(p),
  };
  listeners.push(event);
  return { event, waits };
};

beforeEach(async () => {
  vi.clearAllMocks();
  await loadSw();
});

describe('service worker: setup', () => {
  it('assume controle, limpa caches antigos e faz o precache do manifest', () => {
    expect(wb.clientsClaim).toHaveBeenCalled();
    expect(wb.cleanupOutdatedCaches).toHaveBeenCalled();
    expect(wb.precacheAndRoute).toHaveBeenCalledWith([{ url: 'index.html' }]);
  });

  it('SKIP_WAITING ativa a nova versão; outras mensagens são ignoradas', () => {
    listeners.message({ data: { type: 'OUTRA' } });
    expect(self.skipWaiting).not.toHaveBeenCalled();
    listeners.message({ data: { type: 'SKIP_WAITING' } });
    expect(self.skipWaiting).toHaveBeenCalled();
    expect(() => listeners.message({ data: undefined })).not.toThrow();
  });
});

describe('service worker: rotas de cache', () => {
  it('registra duas rotas CacheFirst com expiração', () => {
    expect(wb.registerRoute).toHaveBeenCalledTimes(2);
    const [, firstStrategy] = wb.registerRoute.mock.calls[0];
    const [, secondStrategy] = wb.registerRoute.mock.calls[1];
    expect(firstStrategy.opts.cacheName).toBe('exercise-media');
    expect(secondStrategy.opts.cacheName).toBe('exercise-media-custom');
    expect(wb.ExpirationPlugin).toHaveBeenCalledWith({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 });
    expect(wb.ExpirationPlugin).toHaveBeenCalledWith({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 180 });
  });

  it('demonstrações do app: só mesma origem e caminho /EAFIT/exercicios/', () => {
    const [match] = wb.registerRoute.mock.calls[0];
    expect(match({ url: new URL('https://app.test/EAFIT/exercicios/abc/0.webp') })).toBe(true);
    expect(match({ url: new URL('https://outra.test/EAFIT/exercicios/abc/0.webp') })).toBe(false);
    expect(match({ url: new URL('https://app.test/EAFIT/index.html') })).toBe(false);
  });

  it('mídia própria: só imagens do bucket público; vídeo fica na rede', () => {
    const [match] = wb.registerRoute.mock.calls[1];
    const url = new URL('https://proj.supabase.co/storage/v1/object/public/exercise-media/supino-1.gif');
    expect(match({ url, request: { destination: 'image' } })).toBe(true);
    expect(match({ url, request: { destination: 'video' } })).toBe(false);
    expect(match({ url: new URL('https://proj.supabase.co/storage/v1/object/public/outro/a.png'), request: { destination: 'image' } })).toBe(false);
  });
});

describe('service worker: push', () => {
  it('mostra a notificação com título, corpo, tag e URL', () => {
    const { waits } = pushEvent({ title: 'Oi', body: 'Corpo', tag: 't1', url: '/EAFIT/#perfil' });
    expect(registration.showNotification).toHaveBeenCalledWith('Oi', expect.objectContaining({
      body: 'Corpo', tag: 't1', data: { url: '/EAFIT/#perfil' },
      icon: '/EAFIT/icon-192.png', badge: '/EAFIT/icon-192.png',
    }));
    expect(waits).toHaveLength(1);
  });

  it('usa padrões quando faltam campos ou não há dados', () => {
    pushEvent(undefined);
    expect(registration.showNotification).toHaveBeenCalledWith('EAFIT', expect.objectContaining({ body: '', data: { url: '/EAFIT/' } }));
  });

  it('payload que não é JSON vira corpo de texto', () => {
    pushEvent(() => { throw new Error('json'); });
    expect(registration.showNotification).toHaveBeenCalledWith('EAFIT', expect.objectContaining({ body: 'texto cru' }));
  });

  it('no Android não envia icon nem badge', async () => {
    self.navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 14)' };
    pushEvent({ title: 'Oi' });
    const options = registration.showNotification.mock.calls[0][1];
    expect(options.icon).toBeUndefined();
    expect(options.badge).toBeUndefined();
  });
});

describe('service worker: clique na notificação', () => {
  const click = data => {
    const waits = [];
    const event = { notification: { close: vi.fn(), data }, waitUntil: p => waits.push(p) };
    listeners.notificationclick(event);
    return { event, done: Promise.all(waits) };
  };

  it('foca a janela já aberta do app', async () => {
    const focus = vi.fn().mockResolvedValue('focused');
    clientsApi.matchAll.mockResolvedValue([{ url: 'https://x/other' }, { url: 'https://app.test/EAFIT/#treino', focus }]);
    const { event, done } = click({ url: '/EAFIT/#perfil' });
    await done;
    expect(event.notification.close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(clientsApi.openWindow).not.toHaveBeenCalled();
    expect(clientsApi.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });

  it('abre uma janela nova na URL da notificação quando não há nenhuma', async () => {
    clientsApi.matchAll.mockResolvedValue([]);
    await click({ url: '/EAFIT/#historico' }).done;
    expect(clientsApi.openWindow).toHaveBeenCalledWith('/EAFIT/#historico');
  });

  it('sem URL nos dados abre a raiz do app', async () => {
    clientsApi.matchAll.mockResolvedValue([]);
    await click(undefined).done;
    expect(clientsApi.openWindow).toHaveBeenCalledWith('/EAFIT/');
  });
});
