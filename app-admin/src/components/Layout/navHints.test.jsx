// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ALL_SECTIONS, TAB_HINTS, tabByRoute } from './nav';
import { resetFavoritesForTests, toggleFavorite } from '../../lib/favorites';
import Sidebar from './Sidebar';

vi.mock('../../lib/supabase', () => ({ db: {} }));
vi.mock('../../lib/attention', () => ({ useAttention: () => ({}) }));
vi.mock('../../context/useAdminAccess', () => ({ useAdminAccess: () => ({ hiddenScreens: [] }) }));

beforeEach(() => { localStorage.clear(); resetFavoritesForTests(); });

describe('navegação: dicas e fixadas', () => {
  it('toda aba do menu tem uma dica, e nenhuma dica é de rota inexistente', () => {
    const routes = ALL_SECTIONS.flatMap(s => s.tabs.map(t => t.to));
    expect(routes.filter(to => !TAB_HINTS[to])).toEqual([]);
    expect(Object.keys(TAB_HINTS).filter(to => !routes.includes(to))).toEqual([]);
  });

  it('tabByRoute acha a aba e a seção', () => {
    expect(tabByRoute('/users').section.key).toBe('pessoas');
    expect(tabByRoute('/nao-existe')).toBeNull();
  });

  it('a Sidebar mostra o grupo Fixadas só quando há telas fixadas', () => {
    const { rerender } = render(<MemoryRouter><Sidebar open={false} onClose={() => {}} collapsed={false} onToggleCollapsed={() => {}} /></MemoryRouter>);
    expect(screen.queryByText('Fixadas')).toBeNull();
    fireEvent.click(document.body);
    toggleFavorite('/custos');
    rerender(<MemoryRouter><Sidebar open={false} onClose={() => {}} collapsed={false} onToggleCollapsed={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Fixadas')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Custos' }).getAttribute('href')).toBe('/custos');
  });
});
