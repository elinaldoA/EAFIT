// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ rpc: vi.fn(), invites: vi.fn(), signups: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));
vi.mock('../lib/trainers', async orig => ({
  ...(await orig()),
  fetchTrainerActivity: () => Promise.resolve({}),
  fetchUpcomingAppointments: () => Promise.resolve([]),
  fetchTrainerInvites: (...a) => h.invites(...a),
  fetchTrainerInviteSignups: (...a) => h.signups(...a),
}));

import Trainers from './Trainers';

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({
    data: [{ tc_user: 'p1', tc_name: 'Paulo', tc_email: 'p@x', tc_code: 'PAULO1', tc_clients: 3, tc_since: '2026-10-01' }],
    error: null,
  });
  h.invites.mockReset().mockResolvedValue({ p1: { visits: 10, signups: 2, total: 5, linked: 1, active7: 3, lastSignup: null } });
  h.signups.mockReset().mockResolvedValue([
    { userId: 'u1', email: 'lia@x', name: 'Lia', createdAt: '2026-10-18', confirmed: true, lastSeen: '2026-10-20', workouts: 4, client: true },
  ]);
});
afterEach(cleanup);

const renderPage = () => render(<MemoryRouter><Trainers /></MemoryRouter>);

describe('Trainers (indicados pelo link)', () => {
  it('mostra os números do link e os totais', async () => {
    renderPage();
    expect(await screen.findByText(/10 visita\(s\) · 2 cadastro\(s\)/)).toBeTruthy();
    expect(screen.getByText('· 20%')).toBeTruthy();
    expect(screen.getByText('1 viraram aluno · 3 ativos 7d')).toBeTruthy();
    expect(screen.getByText('Indicados no total')).toBeTruthy();
    expect(h.invites).toHaveBeenCalledWith(30);
  });

  it('troca o período', async () => {
    renderPage();
    await screen.findByText(/10 visita/);
    fireEvent.click(screen.getByText('7 dias'));
    await waitFor(() => expect(h.invites).toHaveBeenCalledWith(7));
  });

  it('abre a lista de indicados com o link do personal', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Indicados (5)'));
    expect(await screen.findByText('lia@x')).toBeTruthy();
    expect(screen.getByText('https://eafit.com.br/app/?personal=PAULO1')).toBeTruthy();
    expect(h.signups).toHaveBeenCalledWith('p1');
  });
});
