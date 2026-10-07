// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));

vi.mock('../lib/sound', () => ({ playRestDoneSound: playSound }));
vi.mock('../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));

import RestTimer from './RestTimer';

const session = (extra = {}) => ({ key: 1, seconds: 10, label: 'Supino', ...extra });

beforeEach(() => {
  vi.useFakeTimers();
  playSound.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.classList.remove('modal-open');
});

describe('RestTimer', () => {
  it('mostra o nome do exercício e conta regressivamente', () => {
    render(<RestTimer session={session()} onClose={vi.fn()} />);
    expect(screen.getByText('Descanso · Supino')).toBeTruthy();
    expect(screen.getByText('00:10')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('00:07')).toBeTruthy();
  });

  it('+15s soma ao tempo restante', () => {
    render(<RestTimer session={session()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+15s' }));
    expect(screen.getByText('00:25')).toBeTruthy();
  });

  it('pausar congela a contagem e continuar retoma', () => {
    render(<RestTimer session={session()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '⏸ Pausar' }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('00:10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '▶ Continuar' }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('00:08')).toBeTruthy();
  });

  it('ao acabar toca o alarme uma vez, mostra ✓ e fecha sozinho depois', () => {
    const onClose = vi.fn();
    render(<RestTimer session={session({ seconds: 3 })} onClose={onClose} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('✓')).toBeTruthy();
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1300); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('o botão de liberar só habilita quando o descanso termina', () => {
    render(<RestTimer session={session({ seconds: 2 })} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Aguarde o descanso terminar' }).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button', { name: 'Continuando…' }).disabled).toBe(false);
  });

  it('✕ fecha na hora', () => {
    const onClose = vi.fn();
    render(<RestTimer session={session()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar timer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uma nova sessão (key diferente) reinicia a contagem', () => {
    const { rerender } = render(<RestTimer session={session()} onClose={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText('00:04')).toBeTruthy();
    rerender(<RestTimer session={session({ key: 2, seconds: 45, label: 'Remada' })} onClose={vi.fn()} />);
    expect(screen.getByText('00:45')).toBeTruthy();
    expect(screen.getByText('Descanso · Remada')).toBeTruthy();
  });

  it('trava o scroll da página enquanto aberto e libera ao fechar', () => {
    const { unmount } = render(<RestTimer session={session()} onClose={vi.fn()} />);
    expect(document.body.classList.contains('modal-open')).toBe(true);
    unmount();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
