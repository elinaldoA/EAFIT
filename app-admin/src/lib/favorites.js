import { useSyncExternalStore } from 'react';

// Telas fixadas pelo admin (só neste navegador). Aparecem no topo do menu e na
// busca rápida vazia. Sem storage, a lista vale só até recarregar a página.
const KEY = 'adminFavorites';
export const FAVORITES_MAX = 8;

let memory = null; // cópia em memória: serve de fallback e evita reparsear a cada render
const listeners = new Set();

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, FAVORITES_MAX) : [];
  } catch {
    return [];
  }
}

function snapshot() {
  if (memory === null) memory = load();
  return memory;
}

function save(next) {
  memory = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sem storage: vale só nesta visita */ }
  listeners.forEach(fn => fn());
}

export function readFavorites() { return snapshot(); }

export function isFavorite(to) { return snapshot().includes(to); }

// Fixa ou desafixa. Devolve false quando bate no limite (nada muda).
export function toggleFavorite(to) {
  const list = snapshot();
  if (list.includes(to)) { save(list.filter(x => x !== to)); return true; }
  if (list.length >= FAVORITES_MAX) return false;
  save([...list, to]);
  return true;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useFavorites() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// Só para testes: descarta a cópia em memória e reavisa quem escuta.
export function resetFavoritesForTests() {
  memory = null;
  listeners.forEach(fn => fn());
}
