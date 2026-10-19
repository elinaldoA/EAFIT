// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  fetchInviteName: vi.fn(), acceptTrainerInvite: vi.fn(), fetchMyTrainer: vi.fn(), toast: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainerInvite', async orig => ({
  ...(await orig()), fetchInviteName: h.fetchInviteName, acceptTrainerInvite: h.acceptTrainerInvite,
}));
vi.mock('../lib/trainer', async orig => ({ ...(await orig()), fetchMyTrainer: h.fetchMyTrainer }));

import TrainerInvitePrompt from './TrainerInvitePrompt';
import { capturePersonalInvite, pendingPersonalInvite } from '../lib/trainerInvite';

beforeEach(() => {
  localStorage.clear();
  Object.values(h).forEach(fn => fn.mockReset());
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
