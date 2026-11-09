// Polyfill de localStorage para os módulos que leem preferências salvas no
// navegador (ex.: getWaterGoalLiters em treinoData.js). Evita puxar jsdom
// inteiro só para isso — os testes aqui são de lógica pura, não de componentes.
//
// Precisa se comportar como um Storage de verdade: o código do app enumera as
// chaves guardadas com Object.keys(localStorage) (ver localData.js), e um
// objeto comum só enumeraria os próprios métodos. Isto importa no Node 26,
// onde o localStorage global não existe sem --localstorage-file e este
// polyfill é o que os testes (inclusive os com jsdom) acabam usando.
function createStorage() {
  const store = new Map();
  const api = {
    getItem: key => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => { store.set(String(key), String(value)); },
    removeItem: key => { store.delete(String(key)); },
    clear: () => { store.clear(); },
    key: i => [...store.keys()][i] ?? null,
  };
  return new Proxy(api, {
    get(target, prop) {
      if (prop === 'length') return store.size;
      if (prop in target) return target[prop];
      return typeof prop === 'string' && store.has(prop) ? store.get(prop) : undefined;
    },
    set(_target, prop, value) { store.set(String(prop), String(value)); return true; }, // localStorage.chave = 'x'
    deleteProperty(_target, prop) { store.delete(String(prop)); return true; },
    has(target, prop) { return prop in target || store.has(prop); },
    ownKeys() { return [...store.keys()]; },
    getOwnPropertyDescriptor(_target, prop) {
      return store.has(prop) ? { value: store.get(prop), writable: true, enumerable: true, configurable: true } : undefined;
    },
  });
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = createStorage();
}
