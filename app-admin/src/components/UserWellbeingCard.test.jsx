// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { ins } = vi.hoisted(() => ({ ins: { fetchUserWellbeing: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/insights', async orig => ({ ...(await orig()), ...ins }));

import UserWellbeingCard from './UserWellbeingCard';

beforeEach(() => vi.clearAllMocks());

describe('UserWellbeingCard', () => {
  it('mostra check-ins (com a nota baixa destacada) e medidas', async () => {
    ins.fetchUserWellbeing.mockResolvedValue({
      checkins: [{ id: 'c1', checkin_date: '2026-10-07', energy: 2, sleep: 4, mood: 3 }],
      measures: [{ id: 'm1', measured_on: '2026-10-01', cintura: 86.5, quadril: null, peito: 100, braco: 35, coxa: null }],
    });
    render(<UserWellbeingCard userId="u1" />);
    expect(await screen.findByText('Check-in diário')).toBeTruthy();
    expect(ins.fetchUserWellbeing).toHaveBeenCalledWith('u1');
    expect(screen.getByText('07/10/2026')).toBeTruthy();
    expect(screen.getByText('2').className).toContain('badge--danger');
    expect(screen.getByText('4').className).toContain('badge--ok');
    expect(screen.getByText('86.5')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('só medidas: não mostra o bloco de check-in', async () => {
    ins.fetchUserWellbeing.mockResolvedValue({ checkins: [], measures: [{ id: 'm1', measured_on: '2026-10-01', cintura: 80 }] });
    render(<UserWellbeingCard userId="u1" />);
    expect(await screen.findByText('Medidas corporais (cm)')).toBeTruthy();
    expect(screen.queryByText('Check-in diário')).toBeNull();
  });

  it('sem registros, com erro ou sem usuário não mostra nada', async () => {
    ins.fetchUserWellbeing.mockResolvedValue({ checkins: [], measures: [] });
    const a = render(<UserWellbeingCard userId="u1" />);
    await waitFor(() => expect(ins.fetchUserWellbeing).toHaveBeenCalled());
    expect(a.container.textContent).toBe('');
    a.unmount();

    ins.fetchUserWellbeing.mockRejectedValue(new Error('rls'));
    const b = render(<UserWellbeingCard userId="u1" />);
    await waitFor(() => expect(ins.fetchUserWellbeing).toHaveBeenCalledTimes(2));
    expect(b.container.textContent).toBe('');
    b.unmount();

    render(<UserWellbeingCard />);
    expect(ins.fetchUserWellbeing).toHaveBeenCalledTimes(2);
  });
});
