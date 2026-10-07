import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueue, queueSize, flushQueue } from './syncQueue';

beforeEach(() => {
  localStorage.clear();
});

describe('enqueue / queueSize', () => {
  it('começa vazia', () => {
    expect(queueSize()).toBe(0);
  });

  it('acumula itens enfileirados', () => {
    enqueue('weight_log', { userId: 'u1', date: '2026-07-10', peso: 80 });
    enqueue('meal_log', { userId: 'u1', date: '2026-07-10', mealName: 'Almoço', completed: true });
    expect(queueSize()).toBe(2);
  });
});

describe('flushQueue', () => {
  it('sem itens não chama nenhum executor e retorna zerado', async () => {
    const exec = vi.fn();
    const result = await flushQueue({ weight_log: exec });
    expect(exec).not.toHaveBeenCalled();
    expect(result).toEqual({ flushed: 0, remaining: 0 });
  });

  it('remove da fila só os itens cujo executor não lançou erro', async () => {
    enqueue('weight_log', { userId: 'u1', peso: 80 });
    enqueue('meal_log', { userId: 'u1', mealName: 'Jantar' });

    const result = await flushQueue({
      weight_log: vi.fn().mockResolvedValue(undefined),
      meal_log: vi.fn().mockRejectedValue(new Error('offline')),
    });

    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect(queueSize()).toBe(1);
  });

  it('ignora silenciosamente operações sem executor registrado', async () => {
    enqueue('tipo_desconhecido', { foo: 'bar' });
    const result = await flushQueue({});
    // Sem executor pro tipo, o item não é removido nem conta como sucesso —
    // fica pendente indefinidamente até que um executor pra esse tipo exista.
    expect(result).toEqual({ flushed: 0, remaining: 1 });
    expect(queueSize()).toBe(1);
  });

  it('preserva itens enfileirados durante o próprio flush (relê a fila em vez de sobrescrever com o snapshot inicial)', async () => {
    enqueue('weight_log', { userId: 'u1', peso: 80 });

    const result = await flushQueue({
      weight_log: vi.fn().mockImplementation(async () => {
        // Simula uma nova escrita falhando enquanto o flush do item acima está em andamento.
        enqueue('meal_log', { userId: 'u1', mealName: 'Concorrente' });
      }),
    });

    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect(queueSize()).toBe(1);
  });
});

describe('coalescência e limites', () => {
  it('várias edições da mesma série viram uma operação só, com o patch mesclado', () => {
    enqueue('set_state', { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 10 } });
    enqueue('set_state', { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 12, completed: true } });
    enqueue('set_state', { workout_id: 'w1', exercise_name: 'Supino', set_number: 2, patch: { carga: 12 } });
    expect(queueSize()).toBe(2);
    const first = JSON.parse(localStorage.getItem('pendingSyncQueue'))[0];
    expect(first.payload.patch).toEqual({ carga: 12, completed: true });
  });

  it('a última escrita de status do mesmo treino vence', () => {
    enqueue('workout_status', { id: 'w1', completed: true });
    enqueue('workout_status', { id: 'w1', completed: false });
    expect(queueSize()).toBe(1);
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))[0].payload.completed).toBe(false);
  });

  it('a fila é limitada em 500 operações (descarta as mais antigas)', () => {
    for (let i = 0; i < 520; i++) enqueue('weight_log', { userId: 'u', date: `d${i}`, peso: 80 });
    expect(queueSize()).toBe(500);
  });
});
