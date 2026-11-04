import { describe, it, expect, vi, afterEach } from 'vitest';

const { mockRpc, mockFrom } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));

import { fetchHealth, HEALTH_TIMEOUT_MS } from './health';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('fetchHealth', () => {
  it('uma consulta pendurada vira erro do bloco e não trava os outros', async () => {
    vi.useFakeTimers();
    mockRpc.mockImplementation(name => (name === 'admin_db_usage' ? new Promise(() => {}) : Promise.resolve({ data: [] })));
    mockFrom.mockReturnValue({ select: () => ({ is: () => ({ lt: () => Promise.resolve({ count: 0 }) }) }) });
    const p = fetchHealth();
    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS + 10);
    const h = await p;
    expect(h.usage.error).toMatch(/demorou demais/);
    expect(h.cron.data).toEqual([]);
    expect(h.overdue.data).toBe(0);
  });
});
