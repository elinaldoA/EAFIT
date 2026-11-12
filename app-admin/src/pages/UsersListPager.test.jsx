// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({
  lib: { fetchUsersPage: vi.fn(), fetchDeactivatedIds: vi.fn(), fetchSegments: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../context/useAdminAccess', () => ({ useAdminAccess: () => ({ can: () => true }) }));
vi.mock('../lib/users', async orig => ({ ...(await orig()), fetchUsersPage: lib.fetchUsersPage, fetchDeactivatedIds: lib.fetchDeactivatedIds }));
vi.mock('../lib/csv', async orig => ({ ...(await orig()), downloadCsv: vi.fn() }));
vi.mock('../lib/segments', async orig => ({ ...(await orig()), fetchSegments: lib.fetchSegments }));

import UsersList from './UsersList';

const user = i => ({
  id: `u${i}`, email: `u${i}@x.com`, nome: `Nome${i}`, sobrenome: '', created_at: '2026-10-01T10:00:00Z',
  last_sign_in_at: null, is_admin: false, banned_until: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  lib.fetchUsersPage.mockResolvedValue({ rows: [user(1), user(2)], total: 120 });
  lib.fetchDeactivatedIds.mockResolvedValue(new Set());
  lib.fetchSegments.mockResolvedValue([]);
});
afterEach(cleanup);

const wrap = () => render(<MemoryRouter><UsersList /></MemoryRouter>);

describe('UsersList — paginação', () => {
  it('mostra a barra de páginas no topo e no fim da tabela', async () => {
    wrap();
    await screen.findByText('u1@x.com');
    expect(screen.getAllByText(/120 usuário\(s\) · página 1 de 3/)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Próxima' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Anterior' }).every(b => b.disabled)).toBe(true);
  });

  it('avança, vai à última página e volta à primeira', async () => {
    wrap();
    await screen.findByText('u1@x.com');
    fireEvent.click(screen.getAllByRole('button', { name: 'Próxima' })[0]);
    await waitFor(() => expect(lib.fetchUsersPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50 })));
    fireEvent.click(screen.getAllByRole('button', { name: 'Última página' })[0]);
    await waitFor(() => expect(lib.fetchUsersPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    fireEvent.click(screen.getAllByRole('button', { name: 'Primeira página' })[0]);
    await waitFor(() => expect(lib.fetchUsersPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 })));
  });

  it('trocar o tamanho da página volta à primeira e recalcula o total de páginas', async () => {
    wrap();
    await screen.findByText('u1@x.com');
    fireEvent.click(screen.getAllByRole('button', { name: 'Próxima' })[0]);
    await waitFor(() => expect(lib.fetchUsersPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
    fireEvent.change(screen.getAllByLabelText('Usuários por página')[0], { target: { value: '25' } });
    await waitFor(() => expect(lib.fetchUsersPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, pageSize: 25 })));
    expect((await screen.findAllByText(/120 usuário\(s\) · página 1 de 5/)).length).toBe(2);
  });
});

describe('UsersList — exportação cortada', () => {
  it('avisa quando o servidor devolve menos usuários do que existem', async () => {
    wrap();
    await screen.findByText('u1@x.com');
    // a exportação pede 10.000 linhas, mas só chegam 2 de 120
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText(/Exportei só 2 de 120/)).toBeTruthy();
  });

  it('não avisa quando a exportação veio completa', async () => {
    lib.fetchUsersPage.mockResolvedValue({ rows: [user(1), user(2)], total: 2 });
    wrap();
    await screen.findByText('u1@x.com');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(lib.fetchUsersPage).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 10000 })));
    expect(screen.queryByText(/Exportei só/)).toBeNull();
  });
});
