// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchAppConfig: vi.fn(), fetchAvatar: vi.fn(), user: { id: 'u1' } }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/appConfig', async (importActual) => ({
  ...(await importActual()),
  fetchAppConfig: (...a) => h.fetchAppConfig(...a),
}));
vi.mock('../lib/avatar', () => ({ fetchAvatar: (...a) => h.fetchAvatar(...a) }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: h.user }) }));

import { ToastProvider } from './ToastContext';
import { useToast } from './useToast';
import { ThemeProvider } from './ThemeContext';
import { useTheme } from './useTheme';
import { AppConfigProvider } from './AppConfigContext';
import { useAppConfig } from './useAppConfig';
import { AvatarProvider } from './AvatarContext';
import { useAvatar } from './useAvatar';
import { DEFAULT_CONFIG } from '../lib/appConfig';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <>
        <button type="button" onClick={() => toast('Olá')}>curto</button>
        <button type="button" onClick={() => toast('Longo', 6000)}>longo</button>
      </>
    );
  }

  beforeEach(() => vi.useFakeTimers());

  it('mostra a mensagem e some depois de 2,6s', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const box = screen.getByRole('status');
    expect(box.classList.contains('show')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'curto' }));
    expect(box.textContent).toBe('Olá');
    expect(box.classList.contains('show')).toBe(true);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(box.classList.contains('show')).toBe(false);
  });

  it('uma mensagem nova reinicia o tempo e aceita duração própria', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const box = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'curto' }));
    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.click(screen.getByRole('button', { name: 'longo' }));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(box.classList.contains('show')).toBe(true);
    expect(box.textContent).toBe('Longo');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(box.classList.contains('show')).toBe(false);
  });
});

describe('ThemeProvider', () => {
  function Probe() {
    const { theme, toggleTheme } = useTheme();
    return <button type="button" onClick={toggleTheme}>{theme}</button>;
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it('sem preferência salva segue o sistema (escuro por padrão)', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sistema claro abre claro', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button').textContent).toBe('light');
  });

  it('a escolha salva vale mais que o sistema', () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button').textContent).toBe('light');
  });

  it('alternar troca o tema, o atributo da página e guarda', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});

describe('AppConfigProvider', () => {
  function Probe() {
    const { config, loaded } = useAppConfig();
    return <div data-testid="cfg">{loaded ? 'carregado' : 'padrão'}|{config.maintenance.enabled ? 'manutencao' : 'liberado'}</div>;
  }
  const flush = () => act(async () => { await Promise.resolve(); });

  beforeEach(() => {
    vi.useFakeTimers();
    h.fetchAppConfig.mockReset().mockResolvedValue({ ...DEFAULT_CONFIG, maintenance: { enabled: true, message: 'x' } });
  });

  it('começa com o padrão liberado e aplica a configuração do admin', async () => {
    render(<AppConfigProvider><Probe /></AppConfigProvider>);
    expect(screen.getByTestId('cfg').textContent).toBe('padrão|liberado');
    await flush();
    expect(screen.getByTestId('cfg').textContent).toBe('carregado|manutencao');
  });

  it('falha de rede mantém o padrão liberado (fail-open)', async () => {
    h.fetchAppConfig.mockRejectedValue(new Error('rede'));
    render(<AppConfigProvider><Probe /></AppConfigProvider>);
    await flush();
    expect(screen.getByTestId('cfg').textContent).toBe('padrão|liberado');
  });

  it('relê a cada 5 minutos e ao voltar para o app; ao desmontar para', async () => {
    const { unmount } = render(<AppConfigProvider><Probe /></AppConfigProvider>);
    await flush();
    h.fetchAppConfig.mockClear();
    await act(async () => { vi.advanceTimersByTime(5 * 60_000); });
    expect(h.fetchAppConfig).toHaveBeenCalledTimes(1);

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.fetchAppConfig).toHaveBeenCalledTimes(2);

    unmount();
    h.fetchAppConfig.mockClear();
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
    expect(h.fetchAppConfig).not.toHaveBeenCalled();
  });
});

describe('AvatarProvider', () => {
  function Probe() {
    const { avatarData } = useAvatar();
    return <div data-testid="av">{avatarData ?? 'sem'}</div>;
  }
  const flush = () => act(async () => { await Promise.resolve(); });

  beforeEach(() => {
    h.user = { id: 'u1' };
    h.fetchAvatar.mockReset().mockResolvedValue('data:img');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('carrega a foto do usuário logado', async () => {
    render(<AvatarProvider><Probe /></AvatarProvider>);
    await flush();
    expect(screen.getByTestId('av').textContent).toBe('data:img');
    expect(h.fetchAvatar).toHaveBeenCalledWith('u1');
  });

  it('sem usuário não busca e fica sem foto', async () => {
    h.user = null;
    render(<AvatarProvider><Probe /></AvatarProvider>);
    await flush();
    expect(screen.getByTestId('av').textContent).toBe('sem');
    expect(h.fetchAvatar).not.toHaveBeenCalled();
  });

  it('falha ao buscar não quebra', async () => {
    h.fetchAvatar.mockRejectedValue(new Error('x'));
    render(<AvatarProvider><Probe /></AvatarProvider>);
    await flush();
    expect(screen.getByTestId('av').textContent).toBe('sem');
  });
});
