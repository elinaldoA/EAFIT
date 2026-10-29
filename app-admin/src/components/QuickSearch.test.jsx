// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { mockUsers } = vi.hoisted(() => ({ mockUsers: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/users', () => ({ fetchUsersPage: mockUsers }));

import QuickSearch from './Layout/QuickSearch';

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QuickSearch />
      <Routes>
        <Route path="*" element={null} />
        <Route path="/comissoes" element={<div>tela-comissoes</div>} />
        <Route path="/users/:id" element={<div>tela-usuario</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockUsers.mockResolvedValue({ rows: [], total: 0 });
});

describe('QuickSearch', () => {
  it('Ctrl+K abre, Enter vai para a tela e fecha', () => {
    renderAt();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'comiss' } });
    expect(screen.getByRole('option', { name: /Comissões/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('tela-comissoes')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"/" abre e Esc fecha', () => {
    renderAt();
    fireEvent.keyDown(document, { key: '/' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('busca usuários a partir de 3 letras e abre o detalhe', async () => {
    vi.useFakeTimers();
    mockUsers.mockResolvedValue({ rows: [{ id: 'u1', nome: 'Maria', sobrenome: 'Silva', email: 'maria@x.com' }], total: 1 });
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'maria' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    vi.useRealTimers();
    expect(mockUsers).toHaveBeenCalledWith({ search: 'maria', pageSize: 6 });
    fireEvent.click(screen.getByRole('option', { name: /Maria Silva/ }));
    expect(screen.getByText('tela-usuario')).toBeTruthy();
  });

  it('abre vazia sugerindo as telas recentes', () => {
    localStorage.setItem('quickSearchRecent', JSON.stringify(['/comissoes', '/nao-existe']));
    renderAt();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByText('Abertas recentemente')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});
