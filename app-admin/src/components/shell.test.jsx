// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { mockAuth, mockAccess } = vi.hoisted(() => ({ mockAuth: { current: {} }, mockAccess: { current: null } }));

vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => mockAuth.current }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/adminAccess', async orig => ({
  ...(await orig()),
  fetchMyAccess: () => (mockAccess.current ? Promise.resolve(mockAccess.current) : Promise.reject(new Error('sem migration'))),
}));

import { NAV_GROUPS, ALL_SECTIONS, sectionForPath, tabForPath, titleForPath } from './Layout/nav';
import ProtectedRoute from './ProtectedRoute';
import EmptyState from './EmptyState';
import Loading from './Loading';
import Layout from './Layout/Layout';
import UserMenu from './Layout/UserMenu';
import { ThemeProvider } from '../context/ThemeContext';
import { useTheme } from '../context/useTheme';

beforeEach(() => {
  mockAuth.current = { adminUser: { email: 'admin@x.com' }, authLoading: false, logout: vi.fn() };
  mockAccess.current = null;
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

  it('Loading devolve o scroll quando vários overlays saem fora de ordem', () => {
    const first = render(<Loading label="Primeiro" />);
    const second = render(<Loading label="Segundo" />);
    first.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    second.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('ThemeProvider', () => {
  it('alterna o tema pelo menu da conta, grava no localStorage e na raiz', () => {
    localStorage.setItem('theme', 'dark');
    render(<MemoryRouter><ThemeProvider><UserMenu /></ThemeProvider></MemoryRouter>);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Menu da conta' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Tema claro/ }));
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

  it('menu começa recolhido e a seta expande e lembra a escolha', () => {
    const { container, unmount } = renderAt('/');
    expect(container.querySelector('.sidebar--collapsed')).toBeTruthy();
    // recolhido, o nome continua acessível (só escondido da tela) e vira dica no hover
    const link = screen.getAllByRole('link', { name: /Pessoas/ })[0];
    expect(link.getAttribute('title')).toMatch(/Pessoas/);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }));
    expect(container.querySelector('.sidebar--collapsed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Recolher menu' }).getAttribute('aria-expanded')).toBe('true');
    expect(localStorage.getItem('sidebarCollapsed')).toBe('0');
    unmount();
    const again = renderAt('/');
    expect(again.container.querySelector('.sidebar--collapsed')).toBeNull();
  });

  it('abre e fecha o menu mobile', () => {
    const { container } = renderAt('/');
    fireEvent.click(screen.getByLabelText('Abrir menu'));
    expect(container.querySelector('.sidebar--open')).toBeTruthy();
    fireEvent.click(container.querySelector('.sidebar__backdrop'));
    expect(container.querySelector('.sidebar--open')).toBeNull();
  });

  it('tela oculta para o admin some do menu e fica bloqueada', async () => {
    mockAccess.current = { role: 'suporte', extraAreas: [], hiddenScreens: ['/users'] };
    renderAt('/users/1');
    expect(await screen.findByText(/não tem acesso a esta tela/)).toBeTruthy();
    expect(screen.queryByText('detalhe')).toBeNull();
    const pessoas = screen.getAllByRole('link', { name: /Pessoas/ })[0];
    expect(pessoas.getAttribute('href')).toBe('/personais');
  });

  it('topbar mostra e-mail e o menu da conta tem perfil, links e sair', () => {
    renderAt('/');
    expect(screen.getByText('admin@x.com')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
    const btn = screen.getByRole('button', { name: 'Menu da conta' });
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menuitem', { name: /Meu perfil/ }).getAttribute('href')).toBe('/perfil');
    expect(screen.getByRole('menuitem', { name: /Site/ }).getAttribute('href')).toBe('https://eafit.com.br/');
    expect(screen.getByRole('menuitem', { name: /App/ }).getAttribute('href')).toBe('https://eafit.com.br/app/');
    fireEvent.click(screen.getByRole('menuitem', { name: /Sair/ }));
    expect(mockAuth.current.logout).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('menu da conta fecha com Esc e com clique fora', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Menu da conta' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu da conta' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
