// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const logout = vi.fn();
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ logout }) }));

import IdleSessionGuard from './IdleSessionGuard';

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); logout.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe('IdleSessionGuard', () => {
  it('fica quieto enquanto há atividade recente', () => {
    render(<IdleSessionGuard idleMs={10_000} warnMs={3_000} />);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('avisa perto do fim e "Continuar conectado" renova', () => {
    render(<IdleSessionGuard idleMs={10_000} warnMs={3_000} />);
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Continuar conectado'));
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('desconecta uma única vez ao expirar', () => {
    render(<IdleSessionGuard idleMs={10_000} warnMs={3_000} />);
    act(() => { vi.advanceTimersByTime(12_000); });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('atividade em outra aba (localStorage) mantém esta viva', () => {
    render(<IdleSessionGuard idleMs={10_000} warnMs={3_000} />);
    act(() => { vi.advanceTimersByTime(8_000); });
    localStorage.setItem('eafit-admin-last-activity', String(Date.now()));
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });
});
