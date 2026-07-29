// Polyfill mínimo de localStorage para os módulos que leem preferências
// salvas no navegador (ex.: getWaterGoalLiters em treinoData.js). Evita puxar
// jsdom inteiro só para isso — os testes aqui são de lógica pura, não de
// componentes.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  };
}
