import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));

import { fetchTrainerInvites, fetchTrainerInviteSignups, fetchUserTrainerInvite, inviteConversion, confirmRate } from './trainers';

beforeEach(() => h.rpc.mockReset());

describe('indicados do personal', () => {
  it('números do link por personal', async () => {
    h.rpc.mockResolvedValue({ data: [{ ti_user: 'p1', ti_visits: '10', ti_signups: '2', ti_total: '5', ti_linked: '1', ti_active_7d: '3', ti_last_signup: '2026-10-18' }], error: null });
    expect(await fetchTrainerInvites(7)).toEqual({ p1: { visits: 10, signups: 2, total: 5, linked: 1, active7: 3, lastSignup: '2026-10-18' } });
    expect(h.rpc).toHaveBeenCalledWith('admin_trainer_invites', { days_back: 7 });
  });

  it('lista de quem entrou pelo link', async () => {
    h.rpc.mockResolvedValue({ data: [{ ts_user: 'u1', ts_email: 'a@x', ts_name: 'Lia', ts_created: 'd', ts_confirmed: true, ts_last_seen: null, ts_workouts: '4', ts_client: false }], error: null });
    expect(await fetchTrainerInviteSignups('p1')).toEqual([
      { userId: 'u1', email: 'a@x', name: 'Lia', createdAt: 'd', confirmed: true, lastSeen: null, workouts: 4, client: false },
    ]);
    expect(h.rpc).toHaveBeenCalledWith('admin_trainer_invite_signups', { p_trainer: 'p1' });
  });

  it('ficha do usuário: personal que indicou ou nada', async () => {
    h.rpc.mockResolvedValue({ data: [{ ti_trainer: 'p1', ti_name: 'Paulo', ti_code: 'PAULO1', ti_created: 'd', ti_client: true }], error: null });
    expect(await fetchUserTrainerInvite('u1')).toEqual({ trainerId: 'p1', name: 'Paulo', code: 'PAULO1', createdAt: 'd', client: true });
    h.rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchUserTrainerInvite('u2')).toBeNull();
  });

  it('erro do banco sobe', async () => {
    h.rpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    await expect(fetchTrainerInvites()).rejects.toThrow('not_authorized');
  });

  it('conversão e taxa de confirmação', () => {
    expect(inviteConversion(0, 2)).toBeNull();
    expect(inviteConversion(10, 3)).toBe(30);
    expect(confirmRate({ appts: 4, cancelled: 2, confirmed: 1 })).toBe(50);
  });
});
