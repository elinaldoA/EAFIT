import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));

import {
  fetchTrainerInvites, fetchTrainerInviteSignups, fetchUserTrainerInvite, inviteConversion, confirmRate,
  fetchTrainerHealth, fetchTrainerClientsDetail, goalRate, clientFlags,
} from './trainers';

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

describe('saúde da carteira do personal', () => {
  it('números por personal', async () => {
    h.rpc.mockResolvedValue({ data: [{
      th_user: 'p1', th_active: '4', th_new: '2', th_lost: '1', th_with_goal: '3',
      th_goal_weeks: '8', th_goal_hit: '6', th_idle14: '1', th_no_contact30: '2',
    }], error: null });
    expect(await fetchTrainerHealth(0)).toEqual({ p1: {
      active: 4, added: 2, lost: 1, withGoal: 3, goalWeeks: 8, goalHit: 6, idle: 1, noContact: 2,
    } });
    expect(h.rpc).toHaveBeenCalledWith('admin_trainer_health', { days_back: 0 });
  });

  it('alunos de um personal', async () => {
    h.rpc.mockResolvedValue({ data: [{
      tcd_user: 'u1', tcd_name: 'Ana', tcd_since: 's', tcd_days30: '5', tcd_last_day: '2026-10-18',
      tcd_weekly_goal: null, tcd_goal_weeks: '0', tcd_goal_hit: '0', tcd_last_contact: null,
    }], error: null });
    expect(await fetchTrainerClientsDetail('p1')).toEqual([{
      userId: 'u1', name: 'Ana', since: 's', days30: 5, lastDay: '2026-10-18',
      weeklyGoal: null, goalWeeks: 0, goalHit: 0, lastContact: null,
    }]);
    expect(h.rpc).toHaveBeenCalledWith('admin_trainer_clients_detail', { p_trainer: 'p1' });
  });

  it('taxa de meta batida', () => {
    expect(goalRate(0, 0)).toBeNull();
    expect(goalRate(4, 3)).toBe(75);
  });

  it('marca aluno parado e sem contato com os mesmos prazos do banco', () => {
    const now = new Date(2026, 9, 20, 15, 0);
    const old = new Date(2026, 7, 1).toISOString();
    expect(clientFlags({ since: old, lastDay: '2026-10-06', lastContact: null }, now)).toEqual(['idle', 'noContact']);
    expect(clientFlags({ since: old, lastDay: '2026-10-07', lastContact: new Date(2026, 9, 1).toISOString() }, now)).toEqual([]);
    // vínculo recente ainda não conta como parado nem sem contato
    expect(clientFlags({ since: new Date(2026, 9, 10).toISOString(), lastDay: null, lastContact: null }, now)).toEqual([]);
  });
});
