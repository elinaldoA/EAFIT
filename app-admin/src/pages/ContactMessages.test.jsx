// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const cm = vi.hoisted(() => ({
  fetchContactMessages: vi.fn(), setContactStatus: vi.fn(), deleteContactMessage: vi.fn(),
}));

vi.mock('../lib/contactMessages', async importOriginal => ({ ...(await importOriginal()), ...cm }));
vi.mock('../lib/supabase', () => ({ db: {} }));

import ContactMessages from './ContactMessages';
import { replyMailto } from '../lib/contactMessages';

const row = {
  id: 'm1', name: 'Ana', email: 'ana@exemplo.com', topic: 'personal', lang: 'pt', status: 'novo',
  message: 'Quero liberar o modo Personal.\nMinha conta é esta.', created_at: '2026-10-09T12:00:00Z', handled_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  cm.fetchContactMessages.mockResolvedValue({ rows: [row], total: 1 });
  cm.setContactStatus.mockResolvedValue();
  cm.deleteContactMessage.mockResolvedValue();
});
afterEach(cleanup);

describe('ContactMessages', () => {
  it('abre nas mensagens novas e mostra quem escreveu, o assunto e o link de resposta', async () => {
    render(<ContactMessages />);
    expect(await screen.findByText(/Quero liberar o modo Personal/)).toBeTruthy();
    expect(cm.fetchContactMessages).toHaveBeenCalledWith({ status: 'novo', page: 0 });
    expect(screen.getByText('🧑‍🏫 Modo Personal')).toBeTruthy();
    expect(screen.getByText(/ana@exemplo\.com/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Responder por e-mail' });
    expect(link.getAttribute('href')).toBe(replyMailto(row));
  });

  it('marca como respondido e recarrega a lista', async () => {
    render(<ContactMessages />);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como respondido' }));
    await waitFor(() => expect(cm.setContactStatus).toHaveBeenCalledWith('m1', 'respondido'));
    await waitFor(() => expect(cm.fetchContactMessages).toHaveBeenCalledTimes(2));
  });

  it('só exclui depois da confirmação', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ContactMessages />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(cm.deleteContactMessage).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(cm.deleteContactMessage).toHaveBeenCalledWith('m1'));
    confirm.mockRestore();
  });

  it('trocar o filtro busca de novo; lista vazia e erro aparecem', async () => {
    cm.fetchContactMessages.mockResolvedValueOnce({ rows: [], total: 0 });
    render(<ContactMessages />);
    expect(await screen.findByText('Nenhuma mensagem com esse filtro.')).toBeTruthy();
    cm.fetchContactMessages.mockRejectedValueOnce(new Error('sem permissão'));
    fireEvent.click(screen.getByRole('button', { name: 'Respondido' }));
    expect(await screen.findByText('sem permissão')).toBeTruthy();
    expect(cm.fetchContactMessages).toHaveBeenLastCalledWith({ status: 'respondido', page: 0 });
  });
});

describe('replyMailto', () => {
  it('monta o e-mail com destinatário, assunto e a mensagem citada, no idioma de quem escreveu', () => {
    const pt = decodeURIComponent(replyMailto(row));
    expect(pt.startsWith('mailto:ana@exemplo.com?subject=Re: sua mensagem para o EAFIT&body=Olá Ana,')).toBe(true);
    expect(pt).toContain('> Quero liberar o modo Personal.\n> Minha conta é esta.');
    expect(decodeURIComponent(replyMailto({ ...row, lang: 'en' }))).toContain('subject=Re: your message to EAFIT&body=Hi Ana,');
  });
});
