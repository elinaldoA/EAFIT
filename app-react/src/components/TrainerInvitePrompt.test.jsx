// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  fetchInviteName: vi.fn(), acceptTrainerInvite: vi.fn(), fetchMyTrainer: vi.fn(), toast: vi.fn(),
  auth: { user: { id: 'u1', user_metadata: {} } },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/trainerInvite', async orig => ({
  ...(await orig()), fetchInviteName: h.fetchInviteName, acceptTrainerInvite: h.acceptTrainerInvite,
}));
vi.mock('../lib/trainer', async orig => ({ ...(await orig()), fetchMyTrainer: h.fetchMyTrainer }));

import TrainerInvitePrompt from './TrainerInvitePrompt';
import { capturePersonalInvite, pendingPersonalInvite } from '../lib/trainerInvite';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  [h.fetchInviteName, h.acceptTrainerInvite, h.fetchMyTrainer, h.toast].forEach(fn => fn.mockReset());
  h.auth = { user: { id: 'u1', user_metadata: {} } };
  h.fetchInviteName.mockResolvedValue('Ana');
  h.fetchMyTrainer.mockResolvedValue(null);
  capturePersonalInvite('?personal=P1A2B3');
});
afterEach(cleanup);

describe('TrainerInvitePrompt', () => {
  it('sem convite guardado não pergunta nada', async () => {
    localStorage.clear();
    const { container } = render(<TrainerInvitePrompt />);
    await Promise.resolve();
    expect(h.fetchInviteName).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('convite guardado de outra visita não aparece ao abrir o app direto', async () => {
    sessionStorage.clear();
    const { container } = render(<TrainerInvitePrompt />);
    await Promise.resolve();
    expect(h.fetchInviteName).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('em outra aba, pergunta a quem se cadastrou pelo convite', async () => {
    sessionStorage.clear();
    h.auth = { user: { id: 'u1', user_metadata: { personal: 'P1A2B3' } } };
    render(<TrainerInvitePrompt />);
    expect(await screen.findByText('🤝 Ana quer acompanhar seu treino')).toBeTruthy();
  });

  it('autorizar vincula pelo convite e apaga o convite', async () => {
    h.acceptTrainerInvite.mockResolvedValue('Ana');
    render(<TrainerInvitePrompt />);
    expect(await screen.findByText('🤝 Ana quer acompanhar seu treino')).toBeTruthy();
    fireEvent.click(screen.getByText('Autorizar'));
    await waitFor(() => expect(h.acceptTrainerInvite).toHaveBeenCalledWith('P1A2B3'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(h.toast).toHaveBeenCalledWith('🤝 Vinculado ao seu personal');
    expect(pendingPersonalInvite()).toBe('');
  });

  it('"Agora não" fecha sem vincular', async () => {
    render(<TrainerInvitePrompt />);
    fireEvent.click(await screen.findByText('Agora não'));
    expect(h.acceptTrainerInvite).not.toHaveBeenCalled();
    expect(pendingPersonalInvite()).toBe('');
  });

  it('quem já tem personal ou código desconhecido não vê o pedido', async () => {
    h.fetchMyTrainer.mockResolvedValue({ name: 'Bia' });
    const { container } = render(<TrainerInvitePrompt />);
    await waitFor(() => expect(pendingPersonalInvite()).toBe(''));
    expect(container.innerHTML).toBe('');
  });

  it('erro do vínculo aparece no pedido', async () => {
    h.acceptTrainerInvite.mockRejectedValue(new Error('already_linked'));
    render(<TrainerInvitePrompt />);
    fireEvent.click(await screen.findByText('Autorizar'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(pendingPersonalInvite()).toBe('P1A2B3');
  });
});
