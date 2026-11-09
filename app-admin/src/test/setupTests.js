// Setup global de testes do app-admin. Registra o cleanup do Testing Library
// depois de cada teste — sem isso, o DOM de um teste fica montado pro
// próximo (vite.config.js não liga test.globals, então o auto-cleanup do
// RTL não se registra sozinho) e queries tipo getAllByTitle passam a
// enxergar elementos de renders antigos.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// No Node 26 o localStorage global não existe sem --localstorage-file (e o
// jsdom não o repõe), então os testes que o usam quebravam fora do CI (que roda
// Node 22). Este Storage de mentira se comporta como o de verdade, inclusive na
// enumeração (Object.keys(localStorage) lista as chaves guardadas). É o mesmo
// do app-react.
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
    set(_target, prop, value) { store.set(String(prop), String(value)); return true; },
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

afterEach(() => {
  cleanup();
});
