import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

clientsClaim();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const APP_URL = '/EAFIT/';

// Demonstrações de execução (public/exercicios, ≈3,4MB): fora do precache pra
// não pesar a instalação — cada uma é baixada na primeira vez que o usuário
// abre "Ver execução" e daí em diante vem do cache, inclusive offline.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith(`${APP_URL}exercicios/`),
  new CacheFirst({
    cacheName: 'exercise-media',
    plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 })],
  })
);

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'EAFIT', body: event.data?.text() || '' };
  }

  const title = data.title || 'EAFIT';
  const options = {
    body: data.body || '',
    tag: data.tag,
    icon: `${APP_URL}icon-192.png`,
    badge: `${APP_URL}icon-192.png`,
    data: { url: data.url || APP_URL },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || APP_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(APP_URL));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
