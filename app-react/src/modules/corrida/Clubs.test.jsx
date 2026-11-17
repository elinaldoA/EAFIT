// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  leaveClub: vi.fn(),
  fetchClubs: vi.fn(),
}));

vi.mock('../../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('./runs', async importOriginal => ({
  ...(await importOriginal()),
  fetchClubs: (...a) => h.fetchClubs(...a),
  leaveClub: (...a) => h.leaveClub(...a),
  fetchClubRanking: async () => [],
  fetchClubGoal: async () => null,
}));
vi.mock('../../lib/supabase', () => ({ db: {} }));

import RunClubs from './Clubs';

const CLUB = { id: 'c1', name: 'Corredores', description: '', isOwner: false, code: 'ABC123', members: 4 };

beforeEach(() => {
  vi.clearAllMocks();
  h.fetchClubs.mockResolvedValue([CLUB]);
  h.leaveClub.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function openClub() {
  render(<RunClubs />);
  fireEvent.click(await screen.findByText('Corredores'));
}

describe('sair do clube', () => {
  it('some na hora, sem confirmação, e só sai no servidor depois de 6s', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await openClub();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Sair do clube' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByText('Corredores')).toBeNull();
    expect(h.toast).toHaveBeenCalledWith('Você saiu do clube Corredores', 6000, expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }));
    expect(h.leaveClub).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
    expect(h.leaveClub).toHaveBeenCalledWith('c1');
  });

  it('Desfazer devolve o clube e nunca sai no servidor', async () => {
    await openClub();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Sair do clube' }));
    act(() => { h.toast.mock.calls.at(-1)[2].action.onClick(); });
    await waitFor(() => expect(screen.getByText('Corredores')).toBeTruthy());
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(h.leaveClub).not.toHaveBeenCalled();
  });
});
