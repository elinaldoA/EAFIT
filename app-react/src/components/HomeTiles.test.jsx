// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ goTo: vi.fn(), weights: [], user: null }));
vi.mock('../lib/appNav', () => ({ goTo: h.goTo }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../lib/weightLog', () => ({ fetchWeightLogs: () => Promise.resolve(h.weights) }));
vi.mock('../data/treinoData', async importOriginal => ({
  ...(await importOriginal()), todayDate: () => '2026-10-07', waterStorageKey: () => 'agua_2026-10-07',
}));

import HomeTiles from './HomeTiles';

const PROFILE = { sexo: 'M', idade: 30, peso: 80, altura: 180, meta: 'massa' };

beforeEach(() => {
  localStorage.clear();
  h.weights = [];
  h.user = { id: 'u1', user_metadata: { ...PROFILE } };
});
afterEach(() => { cleanup(); h.goTo.mockReset(); });

describe('HomeTiles', () => {
  it('água do dia com a barra e o que falta', () => {
    localStorage.setItem('agua_2026-10-07', '1500');
    render(<HomeTiles />);
    expect(screen.getByRole('progressbar', { name: 'Hidratação' }).getAttribute('aria-valuenow')).toBe('54');
    expect(screen.getByText(/Faltam 1,3 L/)).toBeTruthy();
  });

  it('cada cartão leva à sua tela', () => {
    render(<HomeTiles />);
    fireEvent.click(screen.getByRole('button', { name: /Hidratação/ }));
    expect(h.goTo).toHaveBeenLastCalledWith({ tab: 'hidratacao' });
    fireEvent.click(screen.getByRole('button', { name: /Proteína/ }));
    expect(h.goTo).toHaveBeenLastCalledWith({ tab: 'nutricao' });
    fireEvent.click(screen.getByRole('button', { name: /Peso/ }));
    expect(h.goTo).toHaveBeenLastCalledWith({ tab: 'dash', dashTab: 'corpo' });
  });

  it('sem perfil completo, a proteína não inventa meta', () => {
    h.user = { id: 'u1', user_metadata: {} };
    render(<HomeTiles />);
    expect(screen.getByText('Complete o perfil para ver a meta')).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Proteína' })).toBeNull();
  });

  it('peso: último registro e a variação desde o primeiro', async () => {
    h.weights = [{ log_date: '2026-08-01', peso: 68.4 }, { log_date: '2026-10-05', peso: 65.9 }];
    render(<HomeTiles />);
    await waitFor(() => expect(screen.getByText(/-2,5 kg desde o primeiro registro/)).toBeTruthy());
    expect(screen.getByText(/65,9/)).toBeTruthy();
  });

  it('sem peso registrado, convida a registrar', () => {
    render(<HomeTiles />);
    expect(screen.getByText('Registre seu peso para acompanhar')).toBeTruthy();
  });
});
