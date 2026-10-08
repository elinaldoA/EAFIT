// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import Behavior from './Behavior';
import UserClientCard from '../components/UserClientCard';

const DATA = {
  admin_visit_breakdown: [
    { dimension: 'device', value: 'celular', visits: 30 },
    { dimension: 'browser', value: 'safari', visits: 18 },
    { dimension: 'lang', value: 'pt', visits: 30 },
    { dimension: 'hour', value: '19', visits: 12 },
    { dimension: 'weekday', value: '1', visits: 12 },
  ],
  admin_auth_events: [
    { event: 'signup_start', detail: '', total: 20 },
    { event: 'signup_submit', detail: '', total: 10 },
    { event: 'signup_ok', detail: '', total: 5 },
    { event: 'signup_error', detail: 'termos', total: 4 },
  ],
  admin_user_events: [
    { event: '__active__', detail: '', users: 10, days: 30 },
    { event: 'page', detail: 'treino', users: 9, days: 20 },
    { event: 'feature', detail: 'live_mode', users: 5, days: 9 },
    { event: 'onboarding', detail: 'view', users: 4, days: 4 },
    { event: 'push', detail: 'open', users: 2, days: 2 },
  ],
  admin_client_breakdown: [
    { dimension: 'os', value: 'android', users: 7 },
    { dimension: 'display_mode', value: 'standalone', users: 4 },
    { dimension: 'app_version', value: '1.4.2', users: 7 },
  ],
  admin_install_retention: [{ display_mode: 'standalone', users: 4, trained_7d: 3 }],
  admin_workout_completion: [{ started: 20, completed: 15, avg_duration_seconds: 2700, median_duration_seconds: 2400 }],
  admin_workout_dropoff: [{ exercise_name: 'Agachamento Livre', total: 3 }],
};

beforeEach(() => {
  mockRpc.mockReset().mockImplementation(name => Promise.resolve({ data: DATA[name] ?? [], error: null }));
});

describe('Behavior', () => {
  it('mostra visitantes, cadastro, uso, treinos e aparelhos', async () => {
    render(<Behavior />);

    expect(await screen.findByText('Agachamento Livre')).toBeTruthy();
    expect(screen.getByText('Não aceitou os Termos de Uso').closest('tr').textContent).toContain('4');
    expect(screen.getByText('Modo treino ao vivo').closest('li').textContent).toContain('5 · 50%');
    expect(screen.getByText('Registro de água').closest('li').textContent).toContain('0 · 0%');
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    expect(screen.getByText('19h')).toBeTruthy();
    expect(screen.getByText(/abriram o app por uma notificação/).textContent).toContain('20%');
    expect(screen.getAllByText('App instalado').length).toBeGreaterThan(0);
    expect(mockRpc).toHaveBeenCalledWith('admin_user_events', { days_back: 30 });
  });

  it('trocar o período recarrega as consultas', async () => {
    render(<Behavior />);
    await screen.findByText('Agachamento Livre');
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_workout_dropoff', { days_back: 7, max_rows: 10 }));
  });

  it('uma consulta falhando não derruba os outros blocos', async () => {
    mockRpc.mockImplementation(name => Promise.resolve(
      name === 'admin_user_events' ? { data: null, error: new Error('function admin_user_events does not exist') } : { data: DATA[name] ?? [], error: null },
    ));
    render(<Behavior />);

    expect(await screen.findByText('Agachamento Livre')).toBeTruthy();
    expect(screen.getAllByText('function admin_user_events does not exist').length).toBe(2);
  });
});

describe('UserClientCard', () => {
  it('mostra o retrato do último acesso', async () => {
    mockRpc.mockResolvedValue({ data: [{ os: 'ios', browser: 'safari', device: 'celular', display_mode: 'browser', app_version: '1.4.2', lang: 'pt', push_permission: 'granted', last_seen: '2026-10-07' }], error: null });
    render(<UserClientCard userId="u1" />);
    expect(await screen.findByText('iOS (iPhone/iPad)')).toBeTruthy();
    expect(screen.getByText('07/10/2026')).toBeTruthy();
  });

  it('sem registro (ou sem usuário) não mostra nada', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { container } = render(<UserClientCard userId="u1" />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(container.textContent).toBe('');

    mockRpc.mockClear();
    render(<UserClientCard />);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
