// Cópia da corrida em andamento no IndexedDB (mais espaço que o localStorage e
// mais difícil de o navegador limpar). O localStorage continua sendo a fonte:
// esta cópia só entra quando ele perdeu a corrida (limpeza do navegador, falta
// de espaço) e é lida uma vez ao abrir o app (restoreLiveRun, liveRun.js).
// Sem IndexedDB (navegador antigo, aba privada) tudo aqui vira "não faz nada".

const DB_NAME = 'eafit_run';
const STORE = 'kv';
const KEY = 'live';

let opened;

function open() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!opened) {
    opened = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return opened;
}

// Executa uma operação no store; qualquer falha vira undefined, nunca estoura.
async function run(mode, op) {
  const db = await open();
  if (!db) return undefined;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const idbMirror = {
  put: value => run('readwrite', store => store.put(value, KEY)),
  get: () => run('readonly', store => store.get(KEY)),
  del: () => run('readwrite', store => store.delete(KEY)),
};
