// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const { mockUnsubscribe } = vi.hoisted(() => ({ mockUnsubscribe: vi.fn() }));
vi.mock('../lib/emailUnsubscribe', () => ({ unsubscribeEmail: mockUnsubscribe }));

import EmailUnsubscribeScreen from './EmailUnsubscribeScreen';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('EmailUnsubscribeScreen', () => {
  it('cancela com o código do link, confirma e deixa seguir pro app', async () => {
    mockUnsubscribe.mockResolvedValue(true);
    const onClose = vi.fn();
    render(<EmailUnsubscribeScreen token="id.abc" onClose={onClose} />);
    expect(screen.getByText('Cancelando o envio de e-mails…')).toBeTruthy();
    expect(mockUnsubscribe).toHaveBeenCalledWith('id.abc');

    expect(await screen.findByText('Pronto, você não vai mais receber esses e-mails')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para o app' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('avisa quando não deu certo e aponta o caminho pelo Perfil', async () => {
    mockUnsubscribe.mockResolvedValue(false);
    render(<EmailUnsubscribeScreen token="x" onClose={() => {}} />);
    expect(await screen.findByText('Não foi possível cancelar agora')).toBeTruthy();
    expect(screen.getByText(/Perfil → Notificações/)).toBeTruthy();
  });
});
