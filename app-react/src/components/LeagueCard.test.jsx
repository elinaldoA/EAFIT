// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/league', async (importActual) => ({
  ...(await importActual()),
  fetchMyLeague: (...a) => h.api.fetchMyLeague(...a),
  joinLeague: (...a) => h.api.joinLeague(...a),
  leaveLeague: (...a) => h.api.leaveLeague(...a),
}));

import LeagueCard from './LeagueCard';
import { parseLeagueBadge, monthLabel } from '../lib/league';
import { leagueBadges, visibleBadges } from '../lib/achievements';

const MEMBER = {
  enabled: true, member: true, month: '2026-10', division: 'prata', days: 5, position: 2, size: 7,
  top: [{ name: 'Bia', days: 9, position: 1, me: false }, { name: 'Ana', days: 5, position: 2, me: true }],
  last: { month: '2026-09', division: 'bronze', position: 1, days: 6 },
};

beforeEach(() => {
  h.toast.mockReset();
  h.api = { fetchMyLeague: vi.fn(), joinLeague: vi.fn().mockResolvedValue(), leaveLeague: vi.fn().mockResolvedValue() };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('league', () => {
  it('lê o id da medalha e monta as medalhas da grade', () => {
    expect(parseLeagueBadge('liga_ouro_1_2026-10')).toEqual({ division: 'ouro', position: 1, month: '2026-10' });
    expect(parseLeagueBadge('liga_ouro_4_2026-10')).toBeNull();
    expect(parseLeagueBadge('streak_3')).toBeNull();
    expect(monthLabel('2026-09')).toBe('09/2026');
    const ids = new Set(['streak_3', 'liga_prata_2_2026-09', 'liga_ouro_1_2026-10']);
    const lb = leagueBadges(ids);
    expect(lb.map(b => b.id)).toEqual(['liga_ouro_1_2026-10', 'liga_prata_2_2026-09']);
    expect(lb[0]).toMatchObject({ emoji: '🥇', title: 'Liga Ouro · 1º' });
    expect(lb[0].check()).toBe(false);
    expect(visibleBadges(ids).filter(b => b.league)).toHaveLength(2);
  });
});

describe('LeagueCard', () => {
  it('some com a liga desligada ou com erro', async () => {
    h.api.fetchMyLeague.mockResolvedValue({ enabled: false });
    const { container } = render(<LeagueCard />);
    await waitFor(() => expect(h.api.fetchMyLeague).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('convida para entrar e entra', async () => {
    h.api.fetchMyLeague.mockResolvedValueOnce({ enabled: true, member: false, members: 3 }).mockResolvedValue(MEMBER);
    render(<LeagueCard />);
    fireEvent.click(await screen.findByText('Participar da liga'));
    await waitFor(() => expect(h.api.joinLeague).toHaveBeenCalled());
    expect(await screen.findByText(/Divisão 🥈 Prata · você em 2º de 7/)).toBeTruthy();
    expect(h.toast).toHaveBeenCalledWith('🏅 Você entrou na liga!');
  });

  it('mostra o ranking, o mês passado e sai da liga', async () => {
    h.api.fetchMyLeague.mockResolvedValue(MEMBER);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LeagueCard />);
    expect(await screen.findByText(/🥇 Bia/)).toBeTruthy();
    expect(screen.getByText(/Ana\(você\)|Ana \(você\)/)).toBeTruthy();
    expect(screen.getByText(/Mês passado \(09\/2026\): 1º na divisão Bronze/)).toBeTruthy();
    fireEvent.click(screen.getByText('Sair da liga'));
    await waitFor(() => expect(h.api.leaveLeague).toHaveBeenCalled());
  });
});
