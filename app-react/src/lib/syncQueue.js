import { mirrorQueue, readMirror, clearMirror, requestPersistence } from './queueStore';

const STORAGE_KEY = 'pendingSyncQueue';
const OWNER_KEY = 'eafit_data_owner'; // mesma chave de lib/localData.js

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

// Limite de segurança: uma sessão muito longa sem rede não pode estourar a
// cota do localStorage. Passando disso, descarta as operações mais antigas.
const MAX_QUEUE = 500;

// Avisa a tela (faixa de offline, ponto de sincronização) que a fila mudou.
export const SYNC_QUEUE_EVENT = 'eafit-syncqueue';
function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_QUEUE_EVENT));
}

function writeQueue(queue) {
  persist(queue);
  notify();
}

function owner() {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}

function persist(queue) {
  const full = queue.length > MAX_QUEUE ? queue.slice(-MAX_QUEUE) : queue;
  // O espelho no IndexedDB não tem a cota apertada do localStorage: guarda a fila inteira.
  // Antes de juntar o que o espelho já tinha (abertura do app), não grava por cima dele.
  if (reconciled) mirrorQueue(full, owner());
  else reconcile().then(() => mirrorQueue(readQueue(), owner()));
  let items = full;
  // Cota cheia: tenta de novo com metade da fila (as mais recentes) em vez de
  // perder a operação que acabou de acontecer.
  for (let i = 0; i < 4; i++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return;
    } catch {
      items = items.slice(Math.ceil(items.length / 2));
    }
  }
}

// Junta à fila o que o espelho do IndexedDB tem e o localStorage não (o navegador
// apagou o localStorage, ou ele perdeu a última gravação). Roda uma vez por sessão,
// antes da primeira gravação do espelho: sem isso, uma gravação feita na abertura
// (com o localStorage vazio) apagaria do espelho a fila que estava lá.
// Só da mesma conta. O que já está na fila local vence: é mais novo que o espelho.
let reconciled = false;
let reconciling = null;
function reconcile(userId) {
  if (!reconciling) {
    reconciling = mergeMirror(userId || owner()).then(n => { reconciled = true; return n; });
  }
  return reconciling;
}

async function mergeMirror(userId) {
  try {
    const mirror = await readMirror();
    if (!mirror?.items?.length || !userId || mirror.owner !== userId) return 0;
    const current = readQueue();
    const ids = new Set(current.map(op => op.id));
    const byKey = new Map(current.map(op => [coalesceKey(op.type, op.payload), op]).filter(([k]) => k));
    let changed = 0;
    const missing = [];
    for (const op of mirror.items) {
      if (!op || ids.has(op.id)) continue;
      const k = coalesceKey(op.type, op.payload);
      const local = k && byKey.get(k);
      if (!local) { missing.push(op); continue; }
      // Mesmo dado já na fila (ex.: o app regravou a carga ao abrir): o valor local
      // vence campo a campo, mas os campos que só o espelho tem (reps, ✓) voltam.
      if (op.type.startsWith('set_state') && local.type === op.type) {
        const patch = { ...op.payload.patch, ...local.payload.patch };
        if (Object.keys(patch).length > Object.keys(local.payload.patch || {}).length) {
          local.payload = { ...local.payload, patch };
          changed += 1;
        }
      }
    }
    if (!missing.length && !changed) return 0;
    reconciled = true; // a gravação abaixo já pode ir para o espelho
    writeQueue([...missing, ...current]);
    return missing.length + changed;
  } catch {
    return 0;
  }
}

// Na abertura do app (antes de enviar a fila): devolve quantas operações voltaram do espelho.
export async function restoreQueue(userId) {
  requestPersistence();
  return reconcile(userId);
}

// Só para testes: simula uma nova abertura do app.
export function resetQueueMirrorState() {
  reconciled = false;
  reconciling = null;
}

export function clearQueueMirror() {
  clearMirror();
}

// Chave de coalescência: operações que sobrescrevem o mesmo dado (editar a
// carga de uma série várias vezes, marcar/desmarcar o treino) viram uma só —
// só o último estado importa, e a fila não cresce a cada toque.
function coalesceKey(type, p) {
  switch (type) {
    case 'workout_status':
    case 'workout_timer':
    case 'workout_rating':
    case 'workout_notes':
    case 'workout_hr':
      return `${type}:${p.id}`;
    case 'workout_status_by_day':
    case 'workout_timer_by_day':
    case 'workout_rating_by_day':
    case 'workout_notes_by_day':
    case 'workout_hr_by_day':
      return `${type}:${p.userId}:${p.day?.dia}`;
    case 'set_state':
      return `${type}:${p.workout_id}:${p.exercise_name}:${p.set_number}`;
    case 'set_state_by_day':
      return `${type}:${p.userId}:${p.day?.dia}:${p.exercise_name}:${p.set_number}`;
    case 'food_save':
      return `${type}:${p.userId}:${p.row?.id}`;
    case 'entry_save':
      return `${type}:${p.userId}:${p.row?.id}`;
    case 'entry_delete':
      return `${type}:${p.userId}:${p.id}`;
    case 'food_delete':
      return `${type}:${p.userId}:${p.id}`;
    case 'plan_save':
      return `${type}:${p.userId}`;
    case 'water_log':
    case 'protein_log':
    case 'nutrition_log':
    case 'weight_log':
      return `${type}:${p.userId}:${p.date}`;
    default:
      return null;
  }
}

export function enqueue(type, payload) {
  const queue = readQueue();
  const key = coalesceKey(type, payload);
  const existing = key ? queue.find(op => op.type === type && coalesceKey(op.type, op.payload) === key) : null;
  if (existing) {
    existing.payload = type.startsWith('set_state')
      ? { ...existing.payload, ...payload, patch: { ...existing.payload.patch, ...payload.patch } }
      : payload;
  } else {
    queue.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, type, payload });
  }
  writeQueue(queue);
}

export function queueSize() {
  return readQueue().length;
}

// executors: { [type]: async (payload) => void } — cada operação pendente é
// reexecutada; só sai da fila se a execução não lançar erro.
export async function flushQueue(executors) {
  const queue = readQueue();
  if (!queue.length) return { flushed: 0, remaining: 0 };

  const succeededIds = new Set();
  for (const op of queue) {
    const exec = executors[op.type];
    if (!exec) continue;
    try {
      await exec(op.payload);
      succeededIds.add(op.id);
    } catch (err) {
      console.error('flushQueue:', op.type, err);
    }
  }

  // Relê a fila em vez de sobrescrever com o snapshot do início — evita perder
  // itens que foram enfileirados enquanto os `await exec(...)` acima rodavam.
  const current = readQueue().filter(op => !succeededIds.has(op.id));
  writeQueue(current);
  return { flushed: succeededIds.size, remaining: current.length };
}
