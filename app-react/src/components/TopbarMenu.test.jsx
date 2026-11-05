// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import TopbarMenu from './TopbarMenu';

const theme = { theme: 'dark', toggleTheme: vi.fn() };
vi.mock('../context/useTheme', () => ({ useTheme: () => theme }));
vi.mock('./InboxBell', () => ({
  default: function InboxBellMock({ onUnreadChange }) {
    useEffect(() => { onUnreadChange(3); }, [onUnreadChange]);
    return <button type="button" role="menuitem">Avisos</button>;
  },
}));

afterEach(cleanup);

describe('TopbarMenu', () => {
  it('fechado: só o botão, com a bolinha dos avisos não lidos', () => {
    render(<TopbarMenu />);
    const btn = screen.getByRole('button', { name: 'Menu (3 aviso(s) novo(s))' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).toContain('3');
    expect(screen.queryByRole('menuitem', { name: 'Tema claro' })).toBeNull();
  });

  it('abre com avisos, tema e os modos; escolher um item fecha o menu', () => {
    const toProgram = vi.fn();
    render(<TopbarMenu modes={[{ label: '📣 Influenciador', onClick: toProgram }]} />);
    fireEvent.click(screen.getByRole('button', { name: /^Menu/ }));
    expect(screen.getByRole('menuitem', { name: 'Avisos' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Influenciador' }));
    expect(toProgram).toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'Tema claro' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Menu/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tema claro' }));
    expect(theme.toggleTheme).toHaveBeenCalled();
  });

  it('toque fora ou Esc fecha', () => {
    render(<div><TopbarMenu /><p>fora</p></div>);
    const btn = screen.getByRole('button', { name: /^Menu/ });
    fireEvent.click(btn);
    fireEvent.pointerDown(screen.getByText('fora'));
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});
