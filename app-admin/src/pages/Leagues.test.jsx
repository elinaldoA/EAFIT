// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({ lib: { fetchLeague: vi.fn(), setLeagueEnabled: vi.fn(), closeLeagueMonth: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/leagues', async orig => ({ ...(await orig()), ...lib }));

import Leagues from './Leagues';
import { groupStandings, mapStanding, previousMonth } from '../lib/leagues';
import { badgeLabel } from '../lib/userDetailHelpers';

const row = (u, division, days, position, closed = false) => mapStanding({
  lg_user: u, lg_email: `${u}@x.com`, lg_name: u.toUpperCase(), lg_division: division, lg_days: days, lg_position: position, lg_closed: closed,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('leagues', () => {
  it('agrupa por divisão e calcula o mês anterior', () => {
    const g = groupStandings([row('b', 'ouro', 3, 2), row('a', 'ouro', 9, 1), row('c', 'bronze', 0, 1)]);
    expect(g.map(x => x.key)).toEqual(['ouro', 'prata', 'bronze']);
    expect(g[0]).toMatchObject({ members: 2, active: 2, avgDays: 6 });
    expect(g[0].rows.map(r => r.userId)).toEqual(['a', 'b']);
    expect(g[1].avgDays).toBeNull();
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(badgeLabel('liga_ouro_1_2026-10')).toBe('Liga Ouro · 1º (10/2026)');
  });
});

describe('Leagues', () => {
  it('mostra a classificação, liga a liga e fecha um mês passado', async () => {
    lib.fetchLeague.mockResolvedValue({ rows: [row('a', 'ouro', 9, 1)], closed: false, enabled: false });
    lib.setLeagueEnabled.mockResolvedValue();
    lib.closeLeagueMonth.mockResolvedValue(1);
    render(<MemoryRouter><Leagues /></MemoryRouter>);
    expect(await screen.findByText('A')).toBeTruthy();
    expect(screen.queryByText('Fechar o mês e entregar medalhas')).toBeNull();

    fireEvent.click(screen.getByText('Ligar no app'));
    await waitFor(() => expect(lib.setLeagueEnabled).toHaveBeenCalledWith(true, 'adm1'));

    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '2026-01' } });
    await waitFor(() => expect(lib.fetchLeague).toHaveBeenLastCalledWith('2026-01'));
    fireEvent.click(await screen.findByText('Fechar o mês e entregar medalhas'));
    await waitFor(() => expect(lib.closeLeagueMonth).toHaveBeenCalledWith('2026-01'));
    expect(await screen.findByText('Mês fechado. 1 medalha(s) entregue(s).')).toBeTruthy();
  });
});
