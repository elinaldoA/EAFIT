import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import { isAccountDeactivated } from './accountStatus';

beforeEach(() => vi.clearAllMocks());

describe('isAccountDeactivated', () => {
  it('consulta a função do banco e só aceita true', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    expect(await isAccountDeactivated()).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('my_account_deactivated');

    mockRpc.mockResolvedValue({ data: false, error: null });
    expect(await isAccountDeactivated()).toBe(false);
  });

  it('erro de leitura ou de rede conta como não desativada', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    expect(await isAccountDeactivated()).toBe(false);
    mockRpc.mockRejectedValue(new Error('offline'));
    expect(await isAccountDeactivated()).toBe(false);
  });
});
