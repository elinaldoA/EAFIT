// Cópia durável da fila de pendências no IndexedDB.
//
// A fila continua sendo lida e gravada de forma síncrona no localStorage (todo o
// app depende disso). O IndexedDB guarda um espelho: se o navegador apagar o
// localStorage (limpeza de armazenamento, pressão de espaço no iOS), a fila volta
// daqui na abertura. É um único registro com a fila inteira, então o espelho
// nunca fica com operações que já saíram da fila. Tudo é opcional: sem IndexedDB
// (modo privado, testes) as funções não fazem nada.
const DB_NAME = 'eafit-offline';
const STORE = 'kv';
const KEY = 'pendingSyncQueue';

let dbPromise = null;

function open() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
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
  return dbPromise;
}

function run(db, mode, fn) {
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result ?? true);
      tx.onerror = tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Grava uma foto da fila. Só a mais recente importa: se chegar outra enquanto uma
// gravação está em andamento, a anterior é descartada.
let pending = null;
let writing = false;
export function mirrorQueue(items, owner) {
  pending = { items, owner: owner || null };
  if (writing) return;
  writing = true;
  (async () => {
    try {
      while (pending) {
        const snap = pending;
        pending = null;
        const db = await open();
        if (!db) continue;
        await run(db, 'readwrite', s => (snap.items.length || snap.owner
          ? s.put({ items: snap.items, owner: snap.owner, at: Date.now() }, KEY)
          : s.delete(KEY)));
      }
    } finally {
      writing = false;
    }
  })();
}

export async function readMirror() {
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Logout / troca de conta: o espelho não pode sobreviver aos dados locais.
export function clearMirror() {
  mirrorQueue([], null); // passa pela mesma fila de gravação, então não corre contra uma gravação em andamento
}

// Pede ao navegador que não apague o armazenamento do app por conta própria.
export function requestPersistence() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch { /* sem suporte */ }
}
