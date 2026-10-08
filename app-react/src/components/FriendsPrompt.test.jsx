// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {}, flags: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../context/useAppConfig', () => ({ useAppConfig: () => ({ config: { flags: h.flags } }) }));
vi.mock('../lib/friends', async (importActual) => ({
  ...(await importActual()),
  fetchMyFriendProfile: (...a) => h.api.fetchMyFriendProfile(...a),
  fetchMyFriends: (...a) => h.api.fetchMyFriends(...a),
  requestFriend: (...a) => h.api.requestFriend(...a),
}));

import FriendsPrompt from './FriendsPrompt';

const TITLE = 'Treine com um amigo';

beforeEach(() => {
  localStorage.clear();
  h.toast.mockReset();
  h.flags = {};
  h.api = {
    fetchMyFriendProfile: vi.fn().mockResolvedValue({ code: 'K7M2QX', share: true }),
    fetchMyFriends: vi.fn().mockResolvedValue([]),
    requestFriend: vi.fn().mockResolvedValue('sent'),
  };
});
afterEach(() => {
  cleanup();
  delete navigator.share;
});

describe('FriendsPrompt', () => {
  it('oferece o convite a quem ainda não tem amigos, com o código e a prévia do ranking', async () => {
    render(<FriendsPrompt myWeek={3} />);
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(screen.getByText('K7M2QX')).toBeTruthy();
    expect(screen.getByText('1º Você')).toBeTruthy();
    expect(screen.getByText('3 treino(s)')).toBeTruthy();
    expect(screen.getByText('2º Seu amigo aqui')).toBeTruthy();
  });

  it('adiciona pelo código do amigo e some', async () => {
    render(<FriendsPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Já tenho o código de um amigo' }));
    fireEvent.change(screen.getByLabelText('Código do seu amigo'), { target: { value: ' ab-12cd ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('📨 Pedido enviado!'));
    expect(h.api.requestFriend).toHaveBeenCalledWith('AB12CD');
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('código curto ou recusado mostra o erro e mantém o convite', async () => {
    render(<FriendsPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Já tenho o código de um amigo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    expect(screen.getByRole('alert').textContent).toBe('Digite o código do seu amigo.');
    h.api.requestFriend.mockRejectedValue(new Error('invalid_code'));
    fireEvent.change(screen.getByLabelText('Código do seu amigo'), { target: { value: 'ZZZZ99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Código não encontrado/));
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it('não oferece a quem já tem amigo ou pedido', async () => {
    h.api.fetchMyFriends.mockResolvedValue([{ id: 'f1', name: 'Bia', status: 'outgoing', week: null }]);
    const { container } = render(<FriendsPrompt />);
    await waitFor(() => expect(h.api.fetchMyFriendProfile).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('com a função desligada no painel nem consulta', () => {
    h.flags = { amigos: false };
    const { container } = render(<FriendsPrompt />);
    expect(container.firstChild).toBeNull();
    expect(h.api.fetchMyFriends).not.toHaveBeenCalled();
  });

  it('falha ao consultar simplesmente não mostra', async () => {
    h.api.fetchMyFriends.mockRejectedValue(new Error('offline'));
    const { container } = render(<FriendsPrompt />);
    await waitFor(() => expect(h.api.fetchMyFriends).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('Convidar amigo compartilha o código e some', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    render(<FriendsPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: '📤 Convidar amigo' }));
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
    expect(share.mock.calls[0][0].text).toContain('K7M2QX');
    expect(localStorage.getItem('eafit_friends_prompt_dismissed_at')).toBeTruthy();
  });

  it('fechar o menu de compartilhar mantém o convite', async () => {
    navigator.share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    render(<FriendsPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: '📤 Convidar amigo' }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it('sem compartilhar nativo copia o convite e avisa', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<FriendsPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: '📤 Convidar amigo' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('📋 Convite copiado — cole na conversa com seu amigo'));
    expect(writeText.mock.calls[0][0]).toContain('K7M2QX');
  });

  it('Agora não guarda a data e não consulta de novo logo depois', async () => {
    const { unmount } = render(<FriendsPrompt />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText(TITLE)).toBeNull();
    unmount();
    h.api.fetchMyFriends.mockClear();
    const again = render(<FriendsPrompt />);
    expect(again.container.firstChild).toBeNull();
    expect(h.api.fetchMyFriends).not.toHaveBeenCalled();
  });
});
