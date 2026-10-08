// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockInsert } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockInsert: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc, from: () => ({ insert: mockInsert }) } }));

import { detectBrowser, detectDevice, detectDisplayMode } from './clientInfo';

const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36 OPR/111.0',
};

describe('clientInfo', () => {
  it('navegador: os que se dizem Chrome/Safari são reconhecidos antes', () => {
    expect(detectBrowser(UA.chromeAndroid)).toBe('chrome');
    expect(detectBrowser(UA.samsung)).toBe('samsung');
    expect(detectBrowser(UA.edge)).toBe('edge');
    expect(detectBrowser(UA.opera)).toBe('opera');
    expect(detectBrowser(UA.firefox)).toBe('firefox');
    expect(detectBrowser(UA.iphoneSafari)).toBe('safari');
    expect(detectBrowser(UA.iphoneChrome)).toBe('chrome');
    expect(detectBrowser('')).toBe('outro');
  });

  it('aparelho: celular, tablet (inclusive iPad que se diz Mac) e desktop', () => {
    expect(detectDevice(UA.chromeAndroid, 'Linux armv81', 5)).toBe('celular');
    expect(detectDevice(UA.androidTablet, 'Linux armv81', 5)).toBe('tablet');
    expect(detectDevice(UA.iphoneSafari, 'iPhone', 5)).toBe('celular');
    expect(detectDevice(UA.macSafari, 'MacIntel', 5)).toBe('tablet');
    expect(detectDevice(UA.macSafari, 'MacIntel', 0)).toBe('desktop');
    expect(detectDevice(UA.edge, 'Win32', 0)).toBe('desktop');
  });

  it('modo: instalado ou navegador', () => {
    expect(detectDisplayMode({ navigator: { standalone: true } })).toBe('standalone');
    expect(detectDisplayMode({ navigator: {}, matchMedia: () => ({ matches: true }) })).toBe('standalone');
    expect(detectDisplayMode({ navigator: {}, matchMedia: () => ({ matches: false }) })).toBe('browser');
    expect(detectDisplayMode(null)).toBe('browser');
  });
});

// O módulo guarda estado (ligado/usuário/já enviados): cada teste importa uma cópia nova.
async function freshTracking() {
  vi.resetModules();
  return import('./tracking');
}

describe('tracking', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockRpc.mockReset().mockResolvedValue({ error: null });
    mockInsert.mockReset().mockResolvedValue({ error: null });
  });

  it('fica desligado até enableTracking e sem usuário não grava', async () => {
    const t = await freshTracking();
    t.setTrackingUser('u1');
    expect(t.trackEvent('page', 'treino')).toBe(false);
    expect(t.trackAuthEvent('signup_start')).toBe(false);
    t.enableTracking();
    t.setTrackingUser(null);
    expect(t.trackEvent('page', 'treino')).toBe(false);
    expect(t.trackClient()).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('evento do usuário conta 1 vez por dia, mesmo depois de recarregar', async () => {
    let t = await freshTracking();
    t.enableTracking();
    t.setTrackingUser('u1');
    expect(t.trackFeature('water')).toBe(true);
    expect(t.trackFeature('water')).toBe(false);
    expect(t.trackEvent('page', 'treino')).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenCalledWith('track_event', { p_event: 'feature', p_detail: 'water' });

    t = await freshTracking();
    t.enableTracking();
    t.setTrackingUser('u1');
    expect(t.trackFeature('water')).toBe(false);
    t.setTrackingUser('u2');
    expect(t.trackFeature('water')).toBe(true);
  });

  it('limpa o detalhe pro formato do banco e recusa evento inválido', async () => {
    const t = await freshTracking();
    t.enableTracking();
    t.setTrackingUser('u1');
    expect(t.cleanDetail('Weak Password!')).toBe('weak_password');
    expect(t.cleanDetail(null)).toBe('');
    expect(t.trackEvent('Evento Inválido', 'x')).toBe(false);
    t.trackEvent('onboarding', 'Erro Idade');
    expect(mockRpc).toHaveBeenLastCalledWith('track_event', { p_event: 'onboarding', p_detail: 'erro_idade' });
  });

  it('falha de rede não estoura', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));
    const t = await freshTracking();
    t.enableTracking();
    t.setTrackingUser('u1');
    expect(() => t.trackFeature('water')).not.toThrow();
    await Promise.resolve();
  });

  it('retrato do acesso: 1 vez por dia, de novo se algo mudou', async () => {
    const t = await freshTracking();
    t.enableTracking();
    t.setTrackingUser('u1');
    vi.stubGlobal('Notification', { permission: 'default' });
    expect(t.trackClient()).toBe(true);
    expect(t.trackClient()).toBe(false);
    expect(mockRpc).toHaveBeenLastCalledWith('track_client', expect.objectContaining({
      p_display_mode: 'browser', p_lang: 'pt', p_push_permission: 'default', p_app_version: expect.stringMatching(/^\d+\.\d+/),
    }));
    vi.stubGlobal('Notification', { permission: 'granted' });
    expect(t.trackClient()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('evento anônimo da tela de acesso: 1 por sessão por motivo', async () => {
    const t = await freshTracking();
    t.enableTracking();
    expect(t.trackAuthEvent('signup_error', 'termos')).toBe(true);
    expect(t.trackAuthEvent('signup_error', 'termos')).toBe(false);
    expect(t.trackAuthEvent('signup_error', 'weak_password')).toBe(true);
    expect(t.trackAuthEvent('evento_que_nao_existe')).toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledWith({ event: 'signup_error', detail: 'termos' });
  });

  it('abertura por notificação: tira ?push=1 da URL e grava quando o usuário é conhecido', async () => {
    const t = await freshTracking();
    t.enableTracking();
    const replaceState = vi.fn();
    const win = {
      location: { href: 'https://app.test/EAFIT/?push=1&origem=x#historico' },
      history: { state: null, replaceState },
      navigator: {},
    };
    t.capturePushOpen(win);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/EAFIT/?origem=x#historico');
    t.flushPushOpen();
    expect(mockRpc).not.toHaveBeenCalled();
    t.setTrackingUser('u1');
    t.flushPushOpen();
    t.flushPushOpen();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('track_event', { p_event: 'push', p_detail: 'open' });
  });

  it('app já aberto: o service worker avisa por mensagem', async () => {
    const t = await freshTracking();
    t.enableTracking();
    t.setTrackingUser('u1');
    let onMessage;
    const win = {
      location: { href: 'https://app.test/EAFIT/' },
      history: { state: null, replaceState: vi.fn() },
      navigator: { serviceWorker: { addEventListener: (_, fn) => { onMessage = fn; } } },
    };
    t.capturePushOpen(win);
    expect(win.history.replaceState).not.toHaveBeenCalled();
    onMessage({ data: { type: 'outra-coisa' } });
    expect(mockRpc).not.toHaveBeenCalled();
    onMessage({ data: { type: 'eafit-push-open' } });
    expect(mockRpc).toHaveBeenCalledWith('track_event', { p_event: 'push', p_detail: 'open' });
  });
});
