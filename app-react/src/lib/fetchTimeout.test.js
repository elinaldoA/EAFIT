import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTimeoutFetch } from './fetchTimeout';

afterEach(() => vi.useRealTimers());

// Fetch que nunca responde sozinho: só termina se o sinal for abortado.
function hangingFetch() {
  return vi.fn((url, { signal } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    signal?.addEventListener('abort', () => reject(signal.reason || new Error('abort')));
  }));
}

describe('createTimeoutFetch', () => {
  it('rota de dados que não responde falha depois do prazo', async () => {
    vi.useFakeTimers();
    const f = createTimeoutFetch(hangingFetch(), 5000);
    const p = f('https://x.supabase.co/rest/v1/workouts', {});
    const check = expect(p).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(5000);
    await check;
  });

  it('rota de login também tem prazo', async () => {
    vi.useFakeTimers();
    const f = createTimeoutFetch(hangingFetch(), 5000);
    const check = expect(f('https://x.supabase.co/auth/v1/token', {})).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(5000);
    await check;
  });

  it('resposta dentro do prazo passa direto e mantém o keepalive', async () => {
    const base = vi.fn().mockResolvedValue({ ok: true });
    const f = createTimeoutFetch(base, 5000);
    const res = await f('https://x.supabase.co/rest/v1/workouts', { method: 'POST' });
    expect(res).toEqual({ ok: true });
    expect(base.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true });
  });

  it('envio de arquivo (storage) e funções ficam sem prazo', async () => {
    vi.useFakeTimers();
    const base = hangingFetch();
    const f = createTimeoutFetch(base, 5000);
    f('https://x.supabase.co/storage/v1/object/exercise-media/a.gif', {});
    f('https://x.supabase.co/functions/v1/ocr', {});
    await vi.advanceTimersByTimeAsync(60000);
    expect(base.mock.calls[0][1].signal).toBeUndefined();
    expect(base.mock.calls[1][1].signal).toBeUndefined();
  });

  it('cancelamento pedido pelo chamador continua valendo', async () => {
    const f = createTimeoutFetch(hangingFetch(), 5000);
    const ctrl = new AbortController();
    const p = f('https://x.supabase.co/rest/v1/workouts', { signal: ctrl.signal });
    ctrl.abort(new Error('cancelado'));
    await expect(p).rejects.toThrow('cancelado');
  });

  it('já abortado antes de chamar: falha na hora', async () => {
    const f = createTimeoutFetch(hangingFetch(), 5000);
    const ctrl = new AbortController();
    ctrl.abort(new Error('antes'));
    await expect(f('https://x.supabase.co/rest/v1/a', { signal: ctrl.signal })).rejects.toThrow('antes');
  });

  it('o prazo é limpo quando a resposta chega (sem timers soltos)', async () => {
    vi.useFakeTimers();
    const f = createTimeoutFetch(vi.fn().mockResolvedValue({ ok: true }), 5000);
    await f('https://x.supabase.co/rest/v1/a', {});
    expect(vi.getTimerCount()).toBe(0);
  });
});
