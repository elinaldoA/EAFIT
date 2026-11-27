// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/arena', async importActual => ({
  ...(await importActual()),
  fetchArenaRanking: (...a) => h.api.fetchArenaRanking(...a),
  joinArenaRanking: (...a) => h.api.joinArenaRanking(...a),
  leaveArenaRanking: (...a) => h.api.leaveArenaRanking(...a),
}));

import ArenaRanking from './ArenaRanking';

const SEASON = { slug: 'temporada-1', title: 'Temporada 1', starts_on: '2026-12-01', ends_on: '2099-02-28' };
const MEMBER = {
  enabled: true, run_released: true, module: 'all', season: SEASON, member: true,
  xp: 180, position: 2, size: 7,
  top: [{ name: 'Bia', xp: 300, position: 1, me: false }, { name: 'Ana', xp: 180, position: 2, me: true }],
  last: { title: 'Temporada 0', position: 3, xp: 90 },
};

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchArenaRanking: vi.fn(),
    joinArenaRanking: vi.fn().mockResolvedValue(),
    leaveArenaRanking: vi.fn().mockResolvedValue(),
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ArenaRanking', () => {
  it('some com a Arena desligada ou com erro', async () => {
    h.api.fetchArenaRanking.mockResolvedValue({ enabled: false });
    const a = render(<ArenaRanking sport="gym" />);
    await waitFor(() => expect(h.api.fetchArenaRanking).toHaveBeenCalled());
    expect(a.container.innerHTML).toBe('');
    cleanup();
    h.api.fetchArenaRanking.mockRejectedValue(new Error('rpc'));
    const b = render(<ArenaRanking sport="gym" />);
    await waitFor(() => expect(h.api.fetchArenaRanking).toHaveBeenCalledTimes(2));
    expect(b.container.innerHTML).toBe('');
  });

  it('esconde no Run enquanto o módulo não foi liberado', async () => {
    h.api.fetchArenaRanking.mockResolvedValue({ ...MEMBER, run_released: false });
    const { container } = render(<ArenaRanking sport="run" />);
    await waitFor(() => expect(h.api.fetchArenaRanking).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('avisa quando a temporada ainda não começou', async () => {
    h.api.fetchArenaRanking.mockResolvedValue({ enabled: true, run_released: false, season: null, next: { title: 'Temporada 1', starts_on: '2026-12-01' } });
    render(<ArenaRanking sport="gym" />);
    expect(await screen.findByText(/Temporada 1 começa em 01\/12/)).toBeTruthy();
    cleanup();
    h.api.fetchArenaRanking.mockResolvedValue({ enabled: true, season: null, next: null });
    const { container } = render(<ArenaRanking sport="gym" />);
    await waitFor(() => expect(h.api.fetchArenaRanking).toHaveBeenCalledTimes(2));
    expect(container.innerHTML).toBe('');
  });

  it('convida para entrar e entra', async () => {
    h.api.fetchArenaRanking.mockResolvedValueOnce({ enabled: true, run_released: true, season: SEASON, member: false, members: 3 }).mockResolvedValue(MEMBER);
    render(<ArenaRanking sport="gym" />);
    fireEvent.click(await screen.findByText('Participar do ranking'));
    await waitFor(() => expect(h.api.joinArenaRanking).toHaveBeenCalled());
    expect(await screen.findByText('Você em 2º de 7 · 180 XP')).toBeTruthy();
  });

  it('mostra a posição, o placar e a última temporada', async () => {
    h.api.fetchArenaRanking.mockResolvedValue(MEMBER);
    render(<ArenaRanking sport="gym" />);
    expect(await screen.findByText('Você em 2º de 7 · 180 XP')).toBeTruthy();
    expect(screen.getByText(/Bia/)).toBeTruthy();
    expect(screen.getByText(/Ana.*\(você\)/)).toBeTruthy();
    expect(screen.getByText('300 XP')).toBeTruthy();
    expect(screen.getByText('Última temporada (Temporada 0): 3º com 90 XP')).toBeTruthy();
    expect(h.api.fetchArenaRanking).toHaveBeenCalledWith('all');
  });

  it('troca entre o Geral e o ranking do módulo', async () => {
    h.api.fetchArenaRanking.mockResolvedValue(MEMBER);
    render(<ArenaRanking sport="gym" />);
    await screen.findByText('Você em 2º de 7 · 180 XP');
    fireEvent.click(screen.getByText('Gym'));
    await waitFor(() => expect(h.api.fetchArenaRanking).toHaveBeenCalledWith('gym'));
    expect(screen.getByText('Gym').getAttribute('aria-pressed')).toBe('true');
  });

  it('pede XP para quem ainda não pontuou e sai do ranking', async () => {
    h.api.fetchArenaRanking.mockResolvedValue({ ...MEMBER, position: null, xp: 0, top: [], last: null });
    render(<ArenaRanking sport="run" />);
    expect(await screen.findByText('Ganhe XP na temporada para entrar no ranking.')).toBeTruthy();
    fireEvent.click(screen.getByText('Sair do ranking'));
    await waitFor(() => expect(h.api.leaveArenaRanking).toHaveBeenCalled());
    expect(h.toast).toHaveBeenCalledWith('Você saiu do ranking');
  });

  it('avisa quando a ação falha', async () => {
    h.api.fetchArenaRanking.mockResolvedValue({ enabled: true, run_released: true, season: SEASON, member: false, members: 0 });
    h.api.joinArenaRanking.mockRejectedValue(new Error('x'));
    render(<ArenaRanking sport="gym" />);
    fireEvent.click(await screen.findByText('Participar do ranking'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Não foi possível concluir. Tente de novo.'));
  });
});
