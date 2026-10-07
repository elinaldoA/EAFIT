// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
// Helpers puros (códigos, ranking, mensagens) ficam reais; só o acesso ao banco é falso.
vi.mock('../lib/friends', async (importActual) => ({
  ...(await importActual()),
  fetchMyFriendProfile: (...a) => h.api.fetchMyFriendProfile(...a),
  fetchMyFriends: (...a) => h.api.fetchMyFriends(...a),
  fetchFeed: (...a) => h.api.fetchFeed(...a),
  requestFriend: (...a) => h.api.requestFriend(...a),
  respondFriend: (...a) => h.api.respondFriend(...a),
  removeFriendship: (...a) => h.api.removeFriendship(...a),
  setShareActivity: (...a) => h.api.setShareActivity(...a),
  reactToEvent: (...a) => h.api.reactToEvent(...a),
}));

import Friends from './Friends';

const FRIEND = { id: 'f1', name: 'Bia', status: 'friend', week: 3 };
const INCOMING = { id: 'f2', name: 'Caio', status: 'incoming', week: null };
const OUTGOING = { id: 'f3', name: 'Duda', status: 'outgoing', week: null };
const EVENT = { id: 10, name: 'Bia', isMe: false, kind: 'recorde', title: 'Novo recorde em Supino', detail: '100kg', at: new Date().toISOString(), counts: { '🔥': 2 }, mine: null };

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchMyFriendProfile: vi.fn().mockResolvedValue({ code: 'K7M2QX', share: true }),
    fetchMyFriends: vi.fn().mockResolvedValue([FRIEND]),
    fetchFeed: vi.fn().mockResolvedValue([EVENT]),
    requestFriend: vi.fn().mockResolvedValue('sent'),
    respondFriend: vi.fn().mockResolvedValue(undefined),
    removeFriendship: vi.fn().mockResolvedValue(undefined),
    setShareActivity: vi.fn().mockResolvedValue(undefined),
    reactToEvent: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.share;
});

async function setup(props = {}) {
  render(<Friends myWeek={4} {...props} />);
  await screen.findByText('👥 Amigos');
}

describe('Friends', () => {
  it('mostra o código pessoal, o ranking com você e a atividade dos amigos', async () => {
    await setup();
    expect(screen.getByText('K7M2QX')).toBeTruthy();
    const rows = screen.getAllByRole('listitem').filter(li => li.className.includes('challenge__row'));
    expect(rows[0].textContent).toMatch(/1º/);
    expect(rows.map(r => r.textContent).join(' ')).toMatch(/Bia/);
    expect(screen.getByText(/Novo recorde em Supino/)).toBeTruthy();
  });

  it('sem amigos mostra a dica; sem atividade mostra o vazio do feed', async () => {
    h.api.fetchMyFriends.mockResolvedValue([]);
    h.api.fetchFeed.mockResolvedValue([]);
    await setup();
    expect(screen.getByText(/Passe seu código para um amigo/)).toBeTruthy();
    expect(screen.getByText(/Quando você ou seus amigos concluírem treinos/)).toBeTruthy();
  });

  it('falha ao carregar mostra as listas vazias em vez de travar no carregando', async () => {
    h.api.fetchMyFriendProfile.mockRejectedValue(new Error('rede'));
    await setup();
    expect(screen.getByText(/Passe seu código/)).toBeTruthy();
  });

  it('adicionar amigo normaliza o código, avisa e recarrega', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Código do seu amigo'), { target: { value: ' ab-12 cd ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    await waitFor(() => expect(h.api.requestFriend).toHaveBeenCalledWith('AB12CD'));
    expect(h.toast).toHaveBeenCalledWith('📨 Pedido enviado!');
    expect(h.api.fetchMyFriends).toHaveBeenCalledTimes(2);
  });

  it('respostas do servidor: aceito na hora e já são amigos', async () => {
    await setup();
    const input = screen.getByLabelText('Código do seu amigo');
    h.api.requestFriend.mockResolvedValueOnce('accepted');
    fireEvent.change(input, { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🎉 Vocês agora são amigos!'));

    h.api.requestFriend.mockResolvedValueOnce('already');
    fireEvent.change(input, { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Pedido já enviado ou já são amigos'));
  });

  it('código curto demais não chama o servidor', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Código do seu amigo'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    expect(screen.getByRole('alert').textContent).toBe('Digite o código do seu amigo.');
    expect(h.api.requestFriend).not.toHaveBeenCalled();
  });

  it('erro do servidor vira mensagem amigável', async () => {
    h.api.requestFriend.mockRejectedValue(new Error('invalid_code'));
    await setup();
    fireEvent.change(screen.getByLabelText('Código do seu amigo'), { target: { value: 'ZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Código não encontrado/));
  });

  it('pedidos recebidos: aceitar e recusar', async () => {
    h.api.fetchMyFriends.mockResolvedValue([FRIEND, INCOMING]);
    await setup();
    const block = screen.getByText('Pedidos recebidos').parentElement;
    fireEvent.click(within(block).getByRole('button', { name: 'Aceitar' }));
    await waitFor(() => expect(h.api.respondFriend).toHaveBeenCalledWith('f2', true));
    expect(h.toast).toHaveBeenCalledWith('🎉 Amigo adicionado!');

    fireEvent.click(within(block).getByRole('button', { name: 'Recusar' }));
    await waitFor(() => expect(h.api.respondFriend).toHaveBeenCalledWith('f2', false));
  });

  it('pedido enviado pode ser cancelado', async () => {
    h.api.fetchMyFriends.mockResolvedValue([OUTGOING]);
    await setup();
    const block = screen.getByText('Aguardando resposta').parentElement;
    fireEvent.click(within(block).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(h.api.removeFriendship).toHaveBeenCalledWith('f3'));
  });

  it('remover amigo pede confirmação', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(h.api.removeFriendship).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(h.api.removeFriendship).toHaveBeenCalledWith('f1'));
    expect(h.toast).toHaveBeenCalledWith('Amigo removido');
  });

  it('amigo com atividade oculta aparece marcado', async () => {
    h.api.fetchMyFriends.mockResolvedValue([{ ...FRIEND, week: null }]);
    await setup();
    expect(screen.getByText(/atividade oculta/)).toBeTruthy();
  });

  it('reagir a uma publicação envia a reação e recarrega o feed', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reagir com 💪' }));
    await waitFor(() => expect(h.api.reactToEvent).toHaveBeenCalledWith(10, '💪'));
    await waitFor(() => expect(h.api.fetchFeed).toHaveBeenCalledTimes(2));
  });

  it('a contagem de reações aparece e a minha reação fica marcada', async () => {
    h.api.fetchFeed.mockResolvedValue([{ ...EVENT, mine: '🔥' }]);
    await setup();
    const fire = screen.getByRole('button', { name: 'Reagir com 🔥' });
    expect(fire.getAttribute('aria-pressed')).toBe('true');
    expect(fire.textContent).toContain('2');
  });

  it('privacidade: alterna o compartilhamento da atividade', async () => {
    await setup();
    fireEvent.click(screen.getByRole('checkbox', { name: /Compartilhar minha atividade/ }));
    await waitFor(() => expect(h.api.setShareActivity).toHaveBeenCalledWith(false));
    expect(h.toast).toHaveBeenCalledWith('🙈 Sua atividade ficou oculta');
  });

  it('convidar usa o compartilhamento nativo quando existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '📤 Convidar' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('K7M2QX') })));
  });

  it('sem compartilhamento nativo copia o convite', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '📤 Convidar' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('K7M2QX')));
    expect(h.toast).toHaveBeenCalledWith('📋 Convite copiado');
  });
});
