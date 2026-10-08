// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), sendFeedback: vi.fn(), shareInvite: vi.fn() }));

vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/feedback', () => ({
  sendFeedback: (...a) => h.sendFeedback(...a),
  friendlyFeedbackError: () => 'Não foi possível enviar agora. Tente novamente.',
}));
vi.mock('../lib/invite', () => ({ shareInvite: (...a) => h.shareInvite(...a) }));

import AppRatingModal from './AppRatingModal';
import { readAppRatingState } from '../lib/appRating';

beforeEach(() => {
  localStorage.clear();
  h.toast.mockReset();
  h.sendFeedback.mockReset().mockResolvedValue(undefined);
  h.shareInvite.mockReset().mockResolvedValue('shared');
});
afterEach(cleanup);

const star = n => screen.getByRole('button', { name: n === 1 ? '1 estrela' : `${n} estrelas` });
const send = () => screen.getByRole('button', { name: 'Enviar avaliação' });

describe('AppRatingModal', () => {
  it('só libera o envio depois de escolher a nota', () => {
    render(<AppRatingModal userId="u1" onClose={() => {}} />);
    expect(screen.getByText('Está gostando do EAFIT?')).toBeTruthy();
    expect(send().disabled).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(star(4));
    expect(star(4).getAttribute('aria-pressed')).toBe('true');
    expect(send().disabled).toBe(false);
    expect(screen.getByPlaceholderText('O que você mais gosta? (opcional)')).toBeTruthy();
  });

  it('nota alta: envia como elogio, agradece e oferece indicar o app', async () => {
    const onClose = vi.fn();
    render(<AppRatingModal userId="u1" onClose={onClose} />);
    fireEvent.click(star(5));
    fireEvent.click(send());
    expect(await screen.findByText('Obrigado pela avaliação!')).toBeTruthy();
    expect(h.sendFeedback).toHaveBeenCalledWith('u1', 'elogio', 'Avaliação do app: ⭐ 5/5');
    expect(readAppRatingState().answeredAt).toBeTruthy();

    h.shareInvite.mockResolvedValue('copied');
    fireEvent.click(screen.getByRole('button', { name: '📤 Indicar para um amigo' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🔗 Link copiado — cole na conversa com seus amigos'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(readAppRatingState().dismissedAt).toBeUndefined();
  });

  it('nota baixa: pede o que melhorar, envia como sugestão e não oferece indicar', async () => {
    render(<AppRatingModal userId="u1" onClose={() => {}} />);
    fireEvent.click(star(2));
    fireEvent.change(screen.getByPlaceholderText('O que podemos melhorar? (opcional)'), { target: { value: 'trava muito' } });
    fireEvent.click(send());
    await screen.findByText('Obrigado pela avaliação!');
    expect(h.sendFeedback).toHaveBeenCalledWith('u1', 'sugestao', 'Avaliação do app: ⭐ 2/5\ntrava muito');
    expect(screen.queryByRole('button', { name: '📤 Indicar para um amigo' })).toBeNull();
  });

  it('falha no envio mostra o erro e deixa tentar de novo', async () => {
    h.sendFeedback.mockRejectedValue(new Error('offline'));
    render(<AppRatingModal userId="u1" onClose={() => {}} />);
    fireEvent.click(star(1));
    fireEvent.click(send());
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível enviar');
    expect(readAppRatingState().answeredAt).toBeUndefined();
    expect(send().disabled).toBe(false);
  });

  it('Agora não, ✕ e o fundo fecham e adiam a pergunta', () => {
    const onClose = vi.fn();
    const { baseElement } = render(<AppRatingModal userId="u1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(readAppRatingState().dismissedAt).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(baseElement.querySelector('.rating-modal__backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(h.sendFeedback).not.toHaveBeenCalled();
  });
});
