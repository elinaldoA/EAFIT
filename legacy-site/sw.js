// Service worker "ponte" do endereço antigo (elinaldoa.github.io/EAFIT/).
//
// O app instalado nesse endereço procura atualização em /EAFIT/sw.js. Este
// arquivo ocupa esse lugar: instala sem esperar o usuário aceitar, apaga o app
// antigo do cache e recarrega as janelas abertas, que passam a mostrar a
// página de mudança de endereço (index.html desta pasta). Sem handler de
// fetch, tudo vem da rede.
const NEW_APP = 'https://eafit.com.br/app/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => {})));
  })());
});

// Os lembretes continuam chegando pra quem ainda não migrou (a inscrição de
// push é deste endereço); a página de mudança cancela a inscrição quando a
// pessoa segue pro endereço novo, pra não receber em dobro.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'EAFIT', body: event.data?.text() || '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'EAFIT', { body: data.body || '', tag: data.tag }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(NEW_APP));
});
