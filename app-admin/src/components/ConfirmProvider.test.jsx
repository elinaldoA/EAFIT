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
import { useConfirm } from '../context/confirmContext';

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
});
