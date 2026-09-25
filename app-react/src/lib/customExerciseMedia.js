import { db } from './supabase';
import { normalizeExerciseName } from '../data/exerciseMedia';

// Mídia própria de demonstração (tabela exercise_media + bucket público
// exercise-media), enviada pelo painel admin. É uma lista pequena e igual pra
// todo mundo: busca uma vez por sessão e guarda a última versão no
// localStorage, pra continuar valendo offline. Enquanto não chega (ou se a
// rede falhar), vale o que estiver no cache — e, sem nada, a demonstração
// padrão do Free Exercise DB.
const BUCKET = 'exercise-media';
const CACHE_KEY = 'exercise_media_custom';

export function toCustomMediaMap(rows, publicUrlFor) {
  const map = {};
  (rows || []).forEach(r => {
    if (!r?.nome || !r.storage_path) return;
    map[normalizeExerciseName(r.nome)] = {
      url: publicUrlFor(r.storage_path),
      type: r.media_type === 'video' ? 'video' : 'imagem',
    };
  });
  return map;
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

let snapshot = readCache();
let inflight = null;
const listeners = new Set();

export function subscribeCustomMedia(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCustomMediaSnapshot() {
  return snapshot;
}

export function loadCustomMedia() {
  if (inflight) return inflight;
  inflight = db
    .from('exercise_media')
    .select('nome, storage_path, media_type')
    .then(({ data, error }) => {
      if (error) throw error;
      snapshot = toCustomMediaMap(data, path => db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch { /* sem storage */ }
      listeners.forEach(fn => fn());
    })
    .catch(err => {
      console.error('loadCustomMedia:', err);
      inflight = null; // deixa tentar de novo na próxima vez que alguém pedir
    });
  return inflight;
}
