// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  trainerInviteLink, capturePersonalInvite, pendingPersonalInvite, clearPersonalInvite,
  fetchInviteName, acceptTrainerInvite, fetchInviteStats, trainerInviteText,
} from './trainerInvite';
import { detectPersonal } from './pageVisits';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

beforeEach(() => { localStorage.clear(); mockRpc.mockReset(); });

describe('link de convite do personal', () => {
  it('monta o link do app com o código', () => {
    expect(trainerInviteLink('P1A2B3')).toBe('https://eafit.com.br/app/?personal=P1A2B3');
    expect(trainerInviteText('P1A2B3')).toContain('https://eafit.com.br/app/?personal=P1A2B3');
  });

  it('lê o código da URL em maiúsculas e ignora formato inválido', () => {
    expect(detectPersonal('?personal=p1a2b3')).toBe('P1A2B3');
    expect(detectPersonal('?personal=ab')).toBe('');
    expect(detectPersonal('?personal=P1-A2')).toBe('');
    expect(detectPersonal('?ref=anafit')).toBe('');
  });

  it('guarda por 30 dias e o convite mais recente vale', () => {
    capturePersonalInvite('?personal=P11111', NOW);
    capturePersonalInvite('?personal=P22222', NOW + DAY);
    expect(pendingPersonalInvite(NOW + DAY)).toBe('P22222');
    expect(pendingPersonalInvite(NOW + 32 * DAY)).toBe('');
  });

  it('sem código na URL não apaga o convite guardado; clear apaga', () => {
    capturePersonalInvite('?personal=P11111', NOW);
    capturePersonalInvite('', NOW);
    expect(pendingPersonalInvite(NOW)).toBe('P11111');
    clearPersonalInvite();
    expect(pendingPersonalInvite(NOW)).toBe('');
    localStorage.setItem('eafit_personal_invite', '{quebrado');
    expect(pendingPersonalInvite(NOW)).toBe('');
  });

  it('consultas chamam as RPCs e convertem os números', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'Ana', error: null });
    expect(await fetchInviteName('P1A2B3')).toBe('Ana');
    expect(mockRpc).toHaveBeenCalledWith('trainer_invite_name', { p_code: 'P1A2B3' });

    mockRpc.mockResolvedValueOnce({ data: 'Ana', error: null });
    await acceptTrainerInvite('P1A2B3');
    expect(mockRpc).toHaveBeenCalledWith('link_trainer_invite', { p_code: 'P1A2B3' });

    mockRpc.mockResolvedValueOnce({ data: [{ iv_code: 'P1A2B3', iv_visits: '9', iv_signups: '3', iv_clients: '2' }], error: null });
    expect(await fetchInviteStats()).toEqual({ code: 'P1A2B3', visits: 9, signups: 3, clients: 2 });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchInviteStats()).toBeNull();
  });
});
