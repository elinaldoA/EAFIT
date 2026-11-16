// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';

const { mockSyncNow } = vi.hoisted(() => ({ mockSyncNow: vi.fn() }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ syncNow: mockSyncNow }) }));

import OfflineBanner from './OfflineBanner';
import { enqueue, flushQueue } from '../lib/syncQueue';

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

const op = (name) => ({ workout_id: 'w1', exercise_name: name, set_number: 1, patch: { carga: 1 } });

beforeEach(() => {
  localStorage.clear();
  mockSyncNow.mockClear();
  setOnline(true);
});
afterEach(() => cleanup());

describe('OfflineBanner', () => {
  it('tudo certo (com rede e sem pendência): não aparece', () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('sem rede: avisa que o treino está sendo salvo no aparelho', () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status').textContent).toContain('Sem conexão — seu treino está sendo salvo no aparelho.');
    expect(screen.queryByRole('button', { name: 'Tentar agora' })).toBeNull();
  });

  it('aparece e some quando a rede cai e volta', () => {
    const { container } = render(<OfflineBanner />);
    act(() => { setOnline(false); window.dispatchEvent(new Event('offline')); });
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => { setOnline(true); window.dispatchEvent(new Event('online')); });
    expect(container.firstChild).toBeNull();
  });

  it('sem rede mostra quantas alterações estão pendentes, e acompanha a fila', () => {
    setOnline(false);
    render(<OfflineBanner />);
    act(() => { enqueue('set_state', op('A')); });
    expect(screen.getByRole('status').textContent).toContain('1 alteração pendente.');
    act(() => { enqueue('set_state', op('B')); });
    expect(screen.getByRole('status').textContent).toContain('2 alterações pendentes.');
  });

  it('com rede mas pendência (sinal fraco): avisa e oferece tentar agora', () => {
    enqueue('set_state', op('A'));
    render(<OfflineBanner />);
    expect(screen.getByRole('status').textContent).toContain('1 alteração pendente — seu treino está salvo no aparelho.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it('some sozinho quando a fila esvazia', async () => {
    enqueue('set_state', op('A'));
    const { container } = render(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => { await flushQueue({ set_state: async () => {} }); });
    expect(container.firstChild).toBeNull();
  });
});
