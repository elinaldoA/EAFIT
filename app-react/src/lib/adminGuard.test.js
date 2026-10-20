import { describe, it, expect, vi } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('./supabase', () => ({ db: { from: mockFrom } }));

import { isAdminAccount, APP_BLOCKED_USER_IDS } from './adminGuard';

function profile(result) {
  mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }) });
}

describe('isAdminAccount', () => {
  it('ID bloqueado é recusado sem consultar o banco', async () => {
    mockFrom.mockClear();
    expect(await isAdminAccount(APP_BLOCKED_USER_IDS[0])).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('perfil com is_admin=true é recusado', async () => {
    profile({ data: { is_admin: true }, error: null });
    expect(await isAdminAccount('u1')).toBe(true);
  });

  it('admin marca o navegador pra não contar nas métricas; usuário comum não', async () => {
    localStorage.clear();
    profile({ data: { is_admin: false }, error: null });
    await isAdminAccount('u1');
    expect(localStorage.getItem('eafit_staff_device')).toBeNull();
    profile({ data: { is_admin: true }, error: null });
    await isAdminAccount('u1');
    expect(localStorage.getItem('eafit_staff_device')).toBe('1');
  });

  it('usuário comum e falha de leitura passam', async () => {
    profile({ data: { is_admin: false }, error: null });
    expect(await isAdminAccount('u1')).toBe(false);
    profile({ data: null, error: { message: 'x' } });
    expect(await isAdminAccount('u1')).toBe(false);
    mockFrom.mockImplementation(() => { throw new Error('rede'); });
    expect(await isAdminAccount('u1')).toBe(false);
  });
});
