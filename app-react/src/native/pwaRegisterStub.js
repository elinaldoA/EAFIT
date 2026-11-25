// No app nativo não há service worker: o conteúdo já vem empacotado no APK.
// Substitui 'virtual:pwa-register/react' no build --mode native.
export function useRegisterSW() {
  return { needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} };
}
