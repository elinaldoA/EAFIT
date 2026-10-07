const STORAGE_KEY = 'pendingSyncQueue';

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

function writeQueue(queue) {
  let items = queue.length > MAX_QUEUE ? queue.slice(-MAX_QUEUE) : queue;
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

// Chave de coalescência: operações que sobrescrevem o mesmo dado (editar a
// carga de uma série várias vezes, marcar/desmarcar o treino) viram uma só —
// só o último estado importa, e a fila não cresce a cada toque.
function coalesceKey(type, p) {
  switch (type) {
    case 'workout_status':
    case 'workout_timer':
    case 'workout_rating':
    case 'workout_notes':
      return `${type}:${p.id}`;
    case 'workout_status_by_day':
    case 'workout_timer_by_day':
    case 'workout_rating_by_day':
    case 'workout_notes_by_day':
      return `${type}:${p.userId}:${p.day?.dia}`;
    case 'set_state':
      return `${type}:${p.workout_id}:${p.exercise_name}:${p.set_number}`;
    case 'set_state_by_day':
      return `${type}:${p.userId}:${p.day?.dia}:${p.exercise_name}:${p.set_number}`;
    case 'water_log':
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
