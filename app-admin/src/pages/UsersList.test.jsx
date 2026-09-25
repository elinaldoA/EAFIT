import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  db: { rpc: mockRpc },
}));

import { fetchUsers } from '../lib/users';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchUsers', () => {
  it('chama admin_list_users e retorna a lista', async () => {
    const rows = [{ id: 'u1', email: 'a@b.com' }];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    const result = await fetchUsers();

    expect(mockRpc).toHaveBeenCalledWith('admin_list_users');
    expect(result).toEqual(rows);
  });

  it('retorna array vazio quando data vem null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await fetchUsers();

    expect(result).toEqual([]);
  });

  it('propaga erro quando a chamada falha (ex.: não-admin)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });

    await expect(fetchUsers()).rejects.toMatchObject({ message: 'not_authorized' });
  });
});
