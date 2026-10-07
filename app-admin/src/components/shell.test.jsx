// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { mockAuth } = vi.hoisted(() => ({ mockAuth: { current: {} } }));

vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => mockAuth.current }));
vi.mock('../lib/supabase', () => ({ db: {} }));

import { NAV_GROUPS, ALL_SECTIONS, sectionForPath, tabForPath, titleForPath } from './Layout/nav';
import ProtectedRoute from './ProtectedRoute';
import EmptyState from './EmptyState';
import Loading from './Loading';
import Layout from './Layout/Layout';
import { ThemeProvider } from '../context/ThemeContext';
import { useTheme } from '../context/useTheme';
import ThemeToggle from './ThemeToggle';

beforeEach(() => {
  mockAuth.current = { adminUser: { email: 'admin@x.com' }, authLoading: false, logout: vi.fn() };
  localStorage.clear();
  window.matchMedia = () => ({ matches: false });
  document.documentElement.removeAttribute('data-theme');
});

describe('nav', () => {
  it('toda aba aponta para uma rota única', () => {
    const tos = ALL_SECTIONS.flatMap(s => s.tabs.map(t => t.to));
    expect(new Set(tos).size).toBe(tos.length);
    expect(NAV_GROUPS.length).toBeGreaterThan(0);
  });

  it('sectionForPath resolve rota exata, detalhe e raiz', () => {
    expect(sectionForPath('/').key).toBe('dashboard');
    expect(sectionForPath('/users').key).toBe('pessoas');
    expect(sectionForPath('/users/abc').key).toBe('pessoas');
    expect(sectionForPath('/perfil')).toBeNull();
    expect(sectionForPath('/usersX')).toBeNull();
  });

  it('tabForPath só casa a rota exata', () => {
    expect(tabForPath('/users').label).toBe('Usuários');
    expect(tabForPath('/users/abc')).toBeNull();
  });

  it('titleForPath compõe seção e aba, e cobre o perfil', () => {
    expect(titleForPath('/users')).toBe('Pessoas / Usuários');
    expect(titleForPath('/')).toBe('Dashboard');
    expect(titleForPath('/perfil')).toBe('Meu perfil');
    expect(titleForPath('/nada')).toBe('');
  });
});

describe('ProtectedRoute', () => {
  const renderAt = () => render(
    <MemoryRouter initialEntries={['/privado']}>
      <Routes>
        <Route path="/login" element={<div>tela-login</div>} />
        <Route element={<ProtectedRoute />}><Route path="/privado" element={<div>conteudo</div>} /></Route>
      </Routes>
    </MemoryRouter>
  );

  it('mostra loading enquanto autentica', () => {
    mockAuth.current = { adminUser: null, authLoading: true };
    renderAt();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('conteudo')).toBeNull();
  });

  it('redireciona para /login sem admin', () => {
    mockAuth.current = { adminUser: null, authLoading: false };
    renderAt();
    expect(screen.getByText('tela-login')).toBeTruthy();
  });

  it('renderiza a rota filha para admin', () => {
    renderAt();
    expect(screen.getByText('conteudo')).toBeTruthy();
  });
});

describe('EmptyState e Loading', () => {
  it('EmptyState mostra ícone padrão e rótulo', () => {
    render(<EmptyState label="Nada aqui" />);
    expect(screen.getByText('📭')).toBeTruthy();
    expect(screen.getByText('Nada aqui')).toBeTruthy();
  });

  it('Loading usa o rótulo e trava o scroll enquanto montado', () => {
    const { unmount } = render(<Loading label="Aguarde" />);
    expect(screen.getByText('Aguarde')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('ThemeProvider e ThemeToggle', () => {
  it('alterna o tema, grava no localStorage e na raiz', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(screen.getByLabelText('Alternar tema'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('useTheme expõe o tema atual', () => {
    localStorage.setItem('theme', 'light');
    function Probe() { return <span>{useTheme().theme}</span>; }
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByText('light')).toBeTruthy();
  });
});

describe('Layout', () => {
  const renderAt = path => render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/users" element={<div>lista</div>} />
            <Route path="/users/:id" element={<div>detalhe</div>} />
            <Route path="/" element={<div>home</div>} />
          </Route>
        </Routes>
      </ThemeProvider>
    </MemoryRouter>
  );

  it('mostra abas da seção quando a rota é uma aba', () => {
    renderAt('/users');
    expect(screen.getByRole('heading', { name: 'Pessoas' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Pessoas' })).toBeTruthy();
    expect(screen.getByText('lista')).toBeTruthy();
  });

  it('não mostra abas em rota de detalhe', () => {
    renderAt('/users/1');
    expect(screen.queryByRole('heading', { name: 'Pessoas' })).toBeNull();
    expect(screen.getByText('detalhe')).toBeTruthy();
  });

  it('destaca a seção ativa na sidebar', () => {
    renderAt('/users');
    const link = screen.getAllByRole('link', { name: /Pessoas/ })[0];
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('abre e fecha o menu mobile', () => {
    const { container } = renderAt('/');
    fireEvent.click(screen.getByLabelText('Abrir menu'));
    expect(container.querySelector('.sidebar--open')).toBeTruthy();
    fireEvent.click(container.querySelector('.sidebar__backdrop'));
    expect(container.querySelector('.sidebar--open')).toBeNull();
  });

  it('topbar mostra e-mail e chama logout', () => {
    renderAt('/');
    expect(screen.getByText('admin@x.com')).toBeTruthy();
    fireEvent.click(screen.getByText('Sair'));
    expect(mockAuth.current.logout).toHaveBeenCalled();
  });
});
