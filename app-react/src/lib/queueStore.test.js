// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, queueSize, restoreQueue, flushQueue, resetQueueMirrorState } from './syncQueue';
import { readMirror } from './queueStore';
import { clearUserLocalData } from './localData';

const settle = () => new Promise(r => setTimeout(r, 30));

beforeEach(async () => {
  clearUserLocalData();
  await settle();
  localStorage.clear();
  resetQueueMirrorState();
});

// Fecha e reabre o app: o espelho do IndexedDB fica, o estado do módulo não.
const reopen = () => resetQueueMirrorState();

describe('espelho da fila no IndexedDB', () => {
  it('cada alteração da fila é copiada com o dono dos dados', async () => {
    localStorage.setItem('eafit_data_owner', 'u1');
    enqueue('weight_log', { userId: 'u1', date: '2026-07-10', peso: 80 });
    await settle();
    const m = await readMirror();
    expect(m.owner).toBe('u1');
    expect(m.items).toHaveLength(1);
  });

  it('o navegador apagou o localStorage: a fila volta do IndexedDB', async () => {
    localStorage.setItem('eafit_data_owner', 'u1');
    enqueue('weight_log', { userId: 'u1', date: '2026-07-10', peso: 80 });
    enqueue('weight_log', { userId: 'u1', date: '2026-07-11', peso: 81 });
    await settle();
    localStorage.clear(); // limpeza de armazenamento
    reopen();
    localStorage.setItem('eafit_data_owner', 'u1');
    expect(queueSize()).toBe(0);

    expect(await restoreQueue('u1')).toBe(2);
    expect(queueSize()).toBe(2);
  });

  it('fila esvaziada (chave "[]") não é restaurada: nada de reenviar o que já subiu', async () => {
    localStorage.setItem('eafit_data_owner', 'u1');
    enqueue('weight_log', { userId: 'u1', date: '2026-07-10', peso: 80 });
    await flushQueue({ weight_log: async () => {} });
    await settle();
    expect(queueSize()).toBe(0);
    reopen();
    expect(await restoreQueue('u1')).toBe(0);
    expect(queueSize()).toBe(0);
  });

  it('não restaura a fila de outra conta', async () => {
    localStorage.setItem('eafit_data_owner', 'u1');
    enqueue('weight_log', { userId: 'u1', date: '2026-07-10', peso: 80 });
    await settle();
    localStorage.clear();
    reopen();
    expect(await restoreQueue('u2')).toBe(0);
    expect(queueSize()).toBe(0);
  });

  it('logout apaga também o espelho', async () => {
    localStorage.setItem('eafit_data_owner', 'u1');
    enqueue('weight_log', { userId: 'u1', date: '2026-07-10', peso: 80 });
    await settle();
    clearUserLocalData();
    await settle();
    reopen();
    expect(await readMirror()).toBeNull();
    expect(await restoreQueue('u1')).toBe(0);
  });

  it('o que já está no localStorage não é duplicado ao restaurar', async () => {
    localStorage.setItem('eafit_data_owner', 'u1');
    enqueue('weight_log', { userId: 'u1', date: '2026-07-10', peso: 80 });
    await settle();
    reopen();
    expect(await restoreQueue('u1')).toBe(0); // chave presente: nada a restaurar
    expect(queueSize()).toBe(1);
  });

  it('o app regravou a carga antes da restauração: o valor local fica e reps/✓ do espelho voltam', async () => {
    localStorage.setItem('eafit_data_owner', 'u1');
    const base = { workout_id: 'w1', exercise_name: 'Supino', set_number: 2 };
    enqueue('set_state', { ...base, patch: { carga: 130, reps: 8, completed: true } });
    await settle();
    localStorage.removeItem('pendingSyncQueue');
    reopen();
    enqueue('set_state', { ...base, patch: { carga: 135 } }); // gravação na abertura, antes da restauração
    await settle(); // dá tempo de a gravação chegar ao espelho, se fosse gravar por cima
    expect(await restoreQueue('u1')).toBe(1);
    expect(queueSize()).toBe(1);
    const [op] = JSON.parse(localStorage.getItem('pendingSyncQueue'));
    expect(op.payload.patch).toEqual({ carga: 135, reps: 8, completed: true });
  });
});
