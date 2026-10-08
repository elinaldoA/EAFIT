// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  client: { os: 'android', browser: 'chrome', device: 'celular' },
  displayMode: 'browser',
  state: 'manual',
  listeners: new Set(),
  promptInstall: vi.fn(),
}));

vi.mock('../lib/clientInfo', () => ({
  readClientInfo: () => h.client,
  detectDisplayMode: () => h.displayMode,
}));
vi.mock('../lib/installPrompt', async orig => ({
  ...(await orig()),
  subscribeInstall: fn => { h.listeners.add(fn); return () => h.listeners.delete(fn); },
  getInstallState: () => h.state,
  promptInstall: (...a) => h.promptInstall(...a),
}));

import InstallScreen from './InstallScreen';

function setState(state) {
  act(() => {
    h.state = state;
    h.listeners.forEach(fn => fn());
  });
}

beforeEach(() => {
  sessionStorage.clear();
  h.client = { os: 'android', browser: 'chrome', device: 'celular' };
  h.displayMode = 'browser';
  h.state = 'manual';
  h.listeners.clear();
  h.promptInstall.mockReset().mockResolvedValue('accepted');
});
afterEach(cleanup);

describe('InstallScreen', () => {
  it('quem veio do endereço antigo é lembrado de remover o ícone antigo', () => {
    render(<InstallScreen />);
    expect(screen.queryByText(/remova o ícone antigo/)).toBeNull();
    cleanup();

    window.history.replaceState(null, '', '/?origem=mudanca');
    render(<InstallScreen />);
    expect(screen.getByText(/remova o ícone antigo/)).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });

  it('no navegador mostra o passo a passo da plataforma', () => {
    render(<InstallScreen />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Instale o app EAFIT')).toBeTruthy();
    expect(screen.getByText(/Adicionar à tela inicial/)).toBeTruthy();
    expect(screen.queryByText('Instalar app')).toBeNull();
    expect(screen.queryByText(/entre de novo/)).toBeNull();
  });

  it('no iPhone ensina o Compartilhar e avisa que precisa entrar de novo', () => {
    h.client = { os: 'ios', browser: 'safari', device: 'celular' };
    render(<InstallScreen />);
    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeTruthy();
    expect(screen.getByText(/entre de novo com o mesmo e-mail e senha/)).toBeTruthy();
  });

  it('quando o navegador oferece, instala com um toque e confirma ao terminar', async () => {
    render(<InstallScreen />);
    setState('prompt');
    fireEvent.click(screen.getByText('Instalar app'));
    await waitFor(() => expect(h.promptInstall).toHaveBeenCalledTimes(1));
    setState('installed');
    expect(screen.getByText('App instalado!')).toBeTruthy();
    fireEvent.click(screen.getByText('Continuar no navegador'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Agora não" fecha e não volta na mesma sessão', () => {
    const a = render(<InstallScreen />);
    fireEvent.click(screen.getByText('Agora não'));
    expect(a.container.textContent).toBe('');
    a.unmount();
    const b = render(<InstallScreen />);
    expect(b.container.textContent).toBe('');
  });

  it('não aparece no app instalado nem em navegador que não instala', () => {
    h.displayMode = 'standalone';
    const a = render(<InstallScreen />);
    expect(a.container.textContent).toBe('');
    a.unmount();

    h.displayMode = 'browser';
    h.client = { os: 'windows', browser: 'firefox', device: 'desktop' };
    const b = render(<InstallScreen />);
    expect(b.container.textContent).toBe('');
  });
});
