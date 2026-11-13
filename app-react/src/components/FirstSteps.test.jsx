// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1', created_at: new Date().toISOString(), user_metadata: {} },
  toggle: vi.fn(),
  goTo: vi.fn(),
  steps: { workout: false, water: false, food: false, reminders: false },
  permission: 'default',
  notifSupported: true,
  pushSupported: true,
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../hooks/useReminders', () => ({ useReminders: () => [false, h.toggle] }));
vi.mock('../lib/notifications', () => ({ isNotificationSupported: () => h.notifSupported }));
vi.mock('../lib/pushSubscriptions', () => ({ isPushSupported: () => h.pushSupported }));
vi.mock('../lib/appNav', () => ({ goTo: (...a) => h.goTo(...a) }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../lib/firstSteps', async (importActual) => ({
  ...(await importActual()),
  fetchFirstSteps: vi.fn(async () => h.steps),
}));

import FirstSteps from './FirstSteps';

beforeEach(() => {
  localStorage.clear();
  h.toggle.mockReset().mockResolvedValue(undefined);
  h.goTo.mockReset();
  h.permission = 'default';
  h.notifSupported = true;
  h.pushSupported = true;
  globalThis.Notification = { get permission() { return h.permission; } };
});
afterEach(() => { cleanup(); delete globalThis.Notification; });

describe('FirstSteps', () => {
  it('ligar os lembretes é um toque: pede a permissão ali mesmo, sem ir ao Perfil', async () => {
    render(<FirstSteps />);
    fireEvent.click(await screen.findByRole('button', { name: /Ligar os lembretes/ }));
    await waitFor(() => expect(h.toggle).toHaveBeenCalledTimes(1));
    expect(h.goTo).not.toHaveBeenCalled();
  });

  it('com a permissão já negada, leva ao Perfil em vez de pedir de novo', async () => {
    h.permission = 'denied';
    render(<FirstSteps />);
    fireEvent.click(await screen.findByRole('button', { name: /Ligar os lembretes/ }));
    expect(h.goTo).toHaveBeenCalledWith({ tab: 'perfil' });
    expect(h.toggle).not.toHaveBeenCalled();
  });

  it('o passo do treino vira botão quando há um treino para começar', async () => {
    const onStart = vi.fn();
    render(<FirstSteps onStartWorkout={onStart} />);
    fireEvent.click(await screen.findByRole('button', { name: /Fazer o primeiro treino/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
