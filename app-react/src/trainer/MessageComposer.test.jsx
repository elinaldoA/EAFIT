// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), sendMessage: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  sendMessage: (...a) => h.sendMessage(...a),
}));

import MessageComposer from './MessageComposer';

beforeEach(() => {
  h.toast.mockReset();
  h.sendMessage.mockReset().mockResolvedValue(3);
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
});
