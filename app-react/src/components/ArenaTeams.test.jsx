// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../lib/arena', async importActual => ({
  ...(await importActual()),
  fetchArenaTeams: (...a) => h.api.fetchArenaTeams(...a),
}));

import ArenaTeams from './ArenaTeams';

const TRAINER = {
  kind: 'trainer', name: 'Carlos', members: 4, min_team: 3, listed: true, xp: 400, avg: 100, position: 1, size: 2,
  top: [{ name: 'Carlos', avg: 100, members: 4, position: 1, me: true }, { name: 'Marta', avg: 80, members: 5, position: 2, me: false }],
};
const CLUB = { kind: 'club', name: 'Corre Sul', members: 2, min_team: 3, listed: false, xp: null, avg: null, position: null, size: 0, top: [] };
const DATA = { enabled: true, run_released: true, member: true, teams: [TRAINER, CLUB] };

beforeEach(() => { h.api = { fetchArenaTeams: vi.fn() }; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ArenaTeams', () => {
  it('some sem times, sem ter entrado no ranking, desligada ou com erro', async () => {
    for (const value of [
      { enabled: false },
      { enabled: true, member: false, teams: [] },
      { enabled: true, member: true, teams: [] },
    ]) {
      h.api.fetchArenaTeams.mockResolvedValue(value);
      const { container } = render(<ArenaTeams sport="gym" />);
      await waitFor(() => expect(h.api.fetchArenaTeams).toHaveBeenCalled());
      expect(container.innerHTML).toBe('');
      cleanup();
      h.api.fetchArenaTeams.mockClear();
    }
    h.api.fetchArenaTeams.mockRejectedValue(new Error('rpc'));
    const { container } = render(<ArenaTeams sport="gym" />);
    await waitFor(() => expect(h.api.fetchArenaTeams).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('esconde no Run enquanto o módulo não foi liberado', async () => {
    h.api.fetchArenaTeams.mockResolvedValue({ ...DATA, run_released: false });
    const { container } = render(<ArenaTeams sport="run" />);
    await waitFor(() => expect(h.api.fetchArenaTeams).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('mostra a posição do time do personal e o placar dos times', async () => {
    h.api.fetchArenaTeams.mockResolvedValue(DATA);
    render(<ArenaTeams sport="gym" />);
    expect(await screen.findByText('👥 Time do personal Carlos')).toBeTruthy();
    expect(screen.getByText('Seu time em 1º de 2 · média de 100 XP · 4 participantes')).toBeTruthy();
    expect(screen.getByText(/Marta/)).toBeTruthy();
    expect(screen.getByText(/Carlos.*\(seu time\)/)).toBeTruthy();
    expect(screen.getByText('80 XP')).toBeTruthy();
  });

  it('explica ao clube pequeno quantos participantes faltam', async () => {
    h.api.fetchArenaTeams.mockResolvedValue(DATA);
    render(<ArenaTeams sport="run" />);
    expect(await screen.findByText('🏃 Clube Corre Sul')).toBeTruthy();
    expect(screen.getByText('2 no ranking da Arena. Com 3 participantes o time entra na disputa.')).toBeTruthy();
  });

  it('avisa quando o time tem participantes mas ainda não somou XP', async () => {
    h.api.fetchArenaTeams.mockResolvedValue({ ...DATA, teams: [{ ...CLUB, members: 5 }] });
    render(<ArenaTeams sport="run" />);
    expect(await screen.findByText('O time ainda não somou XP nesta temporada.')).toBeTruthy();
  });
});
