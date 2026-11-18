// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const verifyMfaCode = vi.fn();
let fresh = false;
vi.mock('../lib/reauth', () => ({
  verifyMfaCode: (...a) => verifyMfaCode(...a),
  reauthIsFresh: () => fresh,
}));

import ConfirmProvider from './ConfirmProvider';
import { useConfirm, usePrompt } from '../context/confirmContext';

let result;
function Trigger({ opts }) {
  const confirm = useConfirm();
  return <button onClick={async () => { result = await confirm(opts); }}>abrir</button>;
}
function setup(opts) {
  result = undefined;
  render(<ConfirmProvider><Trigger opts={opts} /></ConfirmProvider>);
  fireEvent.click(screen.getByText('abrir'));
}

beforeEach(() => { verifyMfaCode.mockReset(); fresh = false; });

describe('ConfirmProvider', () => {
  it('confirma e cancela', async () => {
    setup({ title: 'Apagar', message: 'Certeza?', confirmLabel: 'Apagar já' });
    expect(screen.getByText('Certeza?')).toBeTruthy();
    fireEvent.click(screen.getByText('Apagar já'));
    await waitFor(() => expect(result).toBe(true));
  });

  it('cancelar e Esc devolvem false', async () => {
    setup({ title: 'Apagar' });
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(result).toBe(false));
    fireEvent.click(screen.getByText('abrir'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(result).toBe(false);
  });

  it('requireText só habilita ao digitar o texto exato', () => {
    setup({ title: 'Apagar', requireText: 'APAGAR', confirmLabel: 'Ok' });
    const btn = screen.getByText('Ok');
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'apagar' } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'APAGAR' } });
    expect(btn.disabled).toBe(false);
  });

  it('reauth: código errado mantém aberto e mostra o erro; certo confirma', async () => {
    verifyMfaCode.mockResolvedValueOnce({ error: 'Código inválido' }).mockResolvedValueOnce({});
    setup({ title: 'Apagar', reauth: true, confirmLabel: 'Ok' });
    const btn = screen.getByText('Ok');
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '111111' } });
    fireEvent.click(btn);
    await screen.findByText('Código inválido');
    expect(result).toBeUndefined();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '222222' } });
    fireEvent.click(screen.getByText('Ok'));
    await waitFor(() => expect(result).toBe(true));
    expect(verifyMfaCode).toHaveBeenCalledTimes(2);
  });

  it('reauth recente não pede o código de novo', async () => {
    fresh = true;
    setup({ title: 'Apagar', reauth: true, confirmLabel: 'Ok' });
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByText('Ok'));
    await waitFor(() => expect(result).toBe(true));
    expect(verifyMfaCode).not.toHaveBeenCalled();
  });

  it('sem provider cai no window.confirm', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    result = undefined;
    render(<Trigger opts={{ title: 'T', message: 'M' }} />);
    fireEvent.click(screen.getByText('abrir'));
    await waitFor(() => expect(result).toBe(true));
    expect(spy).toHaveBeenCalledWith('T\n\nM');
    spy.mockRestore();
  });
});

describe('confirm com texto solto', () => {
  it('aceita só a mensagem e deixa vermelho o que apaga', async () => {
    setup('Excluir esta nota?');
    expect(screen.getByText('Excluir esta nota?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar' }).className).toContain('btn--danger');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(result).toBe(true));
  });

  it('mensagem neutra fica com botão normal', () => {
    setup('Enviar para 3 pessoas?');
    expect(screen.getByRole('button', { name: 'Confirmar' }).className).toContain('btn--primary');
  });

  it('fields: pede texto, só habilita com os obrigatórios e resolve com os valores', async () => {
    setup({
      title: 'Notificar', confirmLabel: 'Enviar',
      fields: [{ name: 'title', label: 'Título', required: true }, { name: 'body', label: 'Mensagem', multiline: true, required: true }],
    });
    const btn = screen.getByText('Enviar');
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Oi' } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Tudo bem?' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(result).toEqual({ title: 'Oi', body: 'Tudo bem?' }));
  });

  it('fields: cancelar devolve false', async () => {
    setup({ title: 'Notificar', fields: [{ name: 'title', label: 'Título' }] });
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(result).toBe(false));
  });
});

describe('usePrompt', () => {
  let value;
  function PromptTrigger({ opts }) {
    const prompt = usePrompt();
    return <button onClick={async () => { value = await prompt(opts); }}>pedir</button>;
  }

  it('devolve o texto (sem espaços nas pontas) ou null ao cancelar', async () => {
    render(<ConfirmProvider><PromptTrigger opts={{ title: 'Nome', label: 'Nome do modelo', defaultValue: 'A' }} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('pedir'));
    fireEvent.change(screen.getByLabelText('Nome do modelo'), { target: { value: '  Meu modelo ' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(value).toBe('Meu modelo'));

    fireEvent.click(screen.getByText('pedir'));
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(value).toBeNull());
  });

  it('campo opcional aceita vazio (devolve string vazia, não null)', async () => {
    render(<ConfirmProvider><PromptTrigger opts={{ title: 'Motivo', label: 'Motivo', required: false, confirmLabel: 'Ok' }} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('pedir'));
    fireEvent.click(screen.getByText('Ok'));
    await waitFor(() => expect(value).toBe(''));
  });

  it('sem provider cai no window.prompt', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('x');
    render(<PromptTrigger opts={{ label: 'Nome' }} />);
    fireEvent.click(screen.getByText('pedir'));
    await waitFor(() => expect(value).toBe('x'));
  });
});
