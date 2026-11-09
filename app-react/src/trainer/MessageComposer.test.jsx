// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), sendMessage: vi.fn(), qr: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  sendMessage: (...a) => h.sendMessage(...a),
}));
vi.mock('../lib/trainerQuickReplies', async (importActual) => ({
  ...(await importActual()),
  fetchQuickReplies: (...a) => h.qr.fetch(...a),
  addQuickReply: (...a) => h.qr.add(...a),
  deleteQuickReply: (...a) => h.qr.del(...a),
}));

import MessageComposer from './MessageComposer';

beforeEach(() => {
  h.toast.mockReset();
  h.sendMessage.mockReset().mockResolvedValue(3);
  h.qr = {
    fetch: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue('q1'),
    del: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(cleanup);

const box = () => screen.getByLabelText('Mensagem');

describe('MessageComposer', () => {
  it('o botão fica desabilitado enquanto não há texto', () => {
    render(<MessageComposer clientIds={[]} label="Enviar para todos" />);
    expect(screen.getByRole('button', { name: 'Enviar para todos' }).disabled).toBe(true);
    fireEvent.change(box(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Enviar para todos' }).disabled).toBe(true);
  });

  it('mostra o contador de caracteres', () => {
    render(<MessageComposer clientIds={[]} label="Enviar" />);
    fireEvent.change(box(), { target: { value: 'Bom treino' } });
    expect(screen.getByText(/10\/500/)).toBeTruthy();
  });

  it('envia o texto sem espaços sobrando para os alunos escolhidos, limpa e avisa', async () => {
    const onSent = vi.fn();
    render(<MessageComposer clientIds={['a', 'b']} label="Enviar para 2 aluno(s)" onSent={onSent} />);
    fireEvent.change(box(), { target: { value: '  Bom treino!  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para 2 aluno(s)' }));
    await waitFor(() => expect(h.sendMessage).toHaveBeenCalledWith(['a', 'b'], 'Bom treino!'));
    expect(h.toast).toHaveBeenCalledWith('✅ Recado enviado para 3 aluno(s)');
    expect(box().value).toBe('');
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('erro do servidor aparece como mensagem e mantém o texto', async () => {
    h.sendMessage.mockRejectedValue(new Error('no_recipients'));
    render(<MessageComposer clientIds={[]} label="Enviar" />);
    fireEvent.change(box(), { target: { value: 'Oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(box().value).toBe('Oi');
  });

  it('limita o tamanho da mensagem', () => {
    render(<MessageComposer clientIds={[]} label="Enviar" />);
    expect(box().maxLength).toBe(500);
  });

  describe('respostas prontas', () => {
    const SAVED = [{ id: 'q1', body: 'Ótimo treino hoje, continue assim!' }, { id: 'q2', body: 'Vamos ajustar a carga na próxima.' }];

    it('sem respostas salvas mostra sugestões, e tocar insere o texto na caixa', () => {
      render(<MessageComposer clientIds={[]} label="Enviar" />);
      fireEvent.click(screen.getByRole('button', { name: 'Bom treino hoje! 💪' }));
      expect(box().value).toBe('Bom treino hoje! 💪');
      // com texto na caixa, acrescenta em nova linha
      fireEvent.click(screen.getByRole('button', { name: /Parabéns pela constância/ }));
      expect(box().value).toBe('Bom treino hoje! 💪\nParabéns pela constância, continue assim!');
    });

    it('com respostas salvas mostra só as do personal', async () => {
      h.qr.fetch.mockResolvedValue(SAVED);
      render(<MessageComposer clientIds={[]} label="Enviar" />);
      expect(await screen.findByRole('button', { name: /Ótimo treino hoje/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Bom treino hoje! 💪' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Vamos ajustar a carga/ }));
      expect(box().value).toBe('Vamos ajustar a carga na próxima.');
    });

    it('salva o texto digitado como resposta pronta e recarrega a lista', async () => {
      h.qr.fetch.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'n1', body: 'Texto novo' }]);
      render(<MessageComposer clientIds={[]} label="Enviar" />);
      fireEvent.change(box(), { target: { value: '  Texto novo ' } });
      fireEvent.click(screen.getByRole('button', { name: '💾 Salvar como resposta pronta' }));
      await waitFor(() => expect(h.qr.add).toHaveBeenCalledWith('Texto novo'));
      expect(await screen.findByRole('button', { name: 'Texto novo' })).toBeTruthy();
      // já salva: o botão de salvar some
      expect(screen.queryByRole('button', { name: '💾 Salvar como resposta pronta' })).toBeNull();
    });

    it('apaga uma resposta pronta pelo modo Editar lista', async () => {
      h.qr.fetch.mockResolvedValue(SAVED);
      render(<MessageComposer clientIds={[]} label="Enviar" />);
      await screen.findByRole('button', { name: /Ótimo treino hoje/ });
      expect(screen.queryByRole('button', { name: /Apagar resposta pronta/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Editar lista' }));
      fireEvent.click(screen.getByRole('button', { name: /Apagar resposta pronta: Ótimo treino hoje/ }));
      await waitFor(() => expect(h.qr.del).toHaveBeenCalledWith('q1'));
      await waitFor(() => expect(screen.queryByRole('button', { name: /Ótimo treino hoje/ })).toBeNull());
    });

    it('erro ao salvar mostra o motivo (limite de respostas)', async () => {
      h.qr.add.mockRejectedValue(new Error('too_many'));
      render(<MessageComposer clientIds={[]} label="Enviar" />);
      fireEvent.change(box(), { target: { value: 'Mais uma' } });
      fireEvent.click(screen.getByRole('button', { name: '💾 Salvar como resposta pronta' }));
      expect((await screen.findByRole('alert')).textContent).toContain('20 respostas prontas');
    });

    it('migration pendente (consulta falha) não quebra: segue com as sugestões', () => {
      h.qr.fetch.mockRejectedValue(new Error('PGRST202'));
      render(<MessageComposer clientIds={[]} label="Enviar" />);
      expect(screen.getByRole('button', { name: 'Bom treino hoje! 💪' })).toBeTruthy();
    });
  });
});
