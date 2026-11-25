import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  listeners: {}, localListeners: {},
  push: {
    checkPermissions: vi.fn(), requestPermissions: vi.fn(), createChannel: vi.fn(), register: vi.fn(), unregister: vi.fn(),
    addListener: vi.fn(),
  },
  local: { schedule: vi.fn(), addListener: vi.fn() },
  db: { rpc: vi.fn(), from: vi.fn() },
  goTo: vi.fn(),
}));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: h.push }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: h.local }));
vi.mock('./supabase', () => ({ db: h.db }));
vi.mock('./appNav', () => ({ goTo: h.goTo }));
vi.mock('./native', () => ({ isNative: () => true }));

import { initNativePush, registerNativePush, unregisterNativePush, getStoredFcmToken, reportNativePushEvent } from './nativePush';

const TOKEN = 'a'.repeat(40);

beforeEach(() => {
  localStorage.clear();
  Object.values(h.push).forEach(f => f.mockReset());
  h.local.schedule.mockReset().mockResolvedValue({});
  h.local.addListener.mockReset().mockImplementation((name, fn) => { h.localListeners[name] = fn; return Promise.resolve({ remove() {} }); });
  h.push.addListener.mockImplementation((name, fn) => { h.listeners[name] = fn; return Promise.resolve({ remove() {} }); });
  h.push.checkPermissions.mockResolvedValue({ receive: 'granted' });
  h.push.requestPermissions.mockResolvedValue({ receive: 'granted' });
  h.push.createChannel.mockResolvedValue();
  h.push.unregister.mockResolvedValue();
  // register() dispara o evento 'registration' com o token, como o plugin faz
  h.push.register.mockImplementation(async () => { setTimeout(() => h.listeners.registration?.({ value: TOKEN }), 0); });
  h.db.rpc.mockReset().mockResolvedValue({ error: null });
  h.db.from.mockReset();
  h.goTo.mockReset();
});

describe('registerNativePush', () => {
  it('pede o token, guarda na conta pela RPC e no aparelho', async () => {
    expect(await registerNativePush()).toBe(TOKEN);
    expect(h.db.rpc).toHaveBeenCalledWith('push_register_fcm', { p_token: TOKEN });
    expect(getStoredFcmToken()).toBe(TOKEN);
    expect(h.push.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'eafit_default' }));
  });

  it('pergunta a permissão só se ainda não foi respondida; negada devolve null', async () => {
    h.push.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    h.push.requestPermissions.mockResolvedValue({ receive: 'denied' });
    expect(await registerNativePush()).toBeNull();
    expect(h.push.requestPermissions).toHaveBeenCalledTimes(1);
    expect(h.push.register).not.toHaveBeenCalled();
  });

  it('erro ao salvar na conta ou do plugin devolve null (cai nos lembretes locais)', async () => {
    h.db.rpc.mockResolvedValue({ error: new Error('rls') });
    expect(await registerNativePush()).toBeNull();
    expect(getStoredFcmToken()).toBe('');
    h.push.register.mockRejectedValue(new Error('sem google-services'));
    expect(await registerNativePush()).toBeNull();
  });

  it('registrationError do FCM devolve null', async () => {
    h.push.register.mockImplementation(async () => { setTimeout(() => h.listeners.registrationError?.({ error: 'x' }), 0); });
    expect(await registerNativePush()).toBeNull();
  });

  it('sem resposta do FCM, desiste depois do prazo', async () => {
    vi.useFakeTimers();
    try {
      h.push.register.mockResolvedValue();
      const p = registerNativePush();
      await vi.advanceTimersByTimeAsync(16000);
      expect(await p).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});

describe('unregisterNativePush', () => {
  it('apaga o token da conta e do aparelho', async () => {
    localStorage.setItem('eafit_fcm_token', TOKEN);
    const eq = vi.fn().mockResolvedValue({ error: null });
    h.db.from.mockReturnValue({ delete: () => ({ eq }) });
    await unregisterNativePush();
    expect(h.db.from).toHaveBeenCalledWith('push_subscriptions');
    expect(eq).toHaveBeenCalledWith('endpoint', `fcm:${TOKEN}`);
    expect(h.push.unregister).toHaveBeenCalled();
    expect(getStoredFcmToken()).toBe('');
  });
});

describe('ouvintes', () => {
  beforeEach(() => { initNativePush(); });

  it('aviso com o app aberto vira notificação local com os dados', () => {
    h.listeners.pushNotificationReceived({ title: 'T', body: 'B', data: { tag: 'water-x' } });
    expect(h.local.schedule.mock.calls[0][0].notifications[0]).toMatchObject({ title: 'T', body: 'B', extra: { tag: 'water-x' } });
  });

  it('toque no aviso abre a tela do assunto pela tag', () => {
    h.listeners.pushNotificationActionPerformed({ notification: { title: 'T', data: { tag: 'water-2027-01-01-09:00' } } });
    expect(h.goTo).toHaveBeenCalledWith(expect.objectContaining({ tab: 'hidratacao' }), { replace: true });
  });

  it('toque no aviso local (app aberto) também navega; sem tag só abre o app', () => {
    h.localListeners.localNotificationActionPerformed({ notification: { title: 'T', extra: { tag: 'water-2027-01-01-09:00' } } });
    expect(h.goTo).toHaveBeenCalledTimes(1);
    h.localListeners.localNotificationActionPerformed({ notification: { title: 'T', extra: {} } });
    expect(h.goTo).toHaveBeenCalledTimes(1);
  });
});

describe('reportNativePushEvent', () => {
  afterEach(() => localStorage.clear());

  it('manda o endpoint fcm: da campanha; sem campanha ou sem token não manda', async () => {
    const f = vi.fn().mockResolvedValue({});
    await reportNativePushEvent('c1', 'clicked', f);
    expect(f).not.toHaveBeenCalled();
    localStorage.setItem('eafit_fcm_token', TOKEN);
    await reportNativePushEvent(undefined, 'clicked', f);
    expect(f).not.toHaveBeenCalled();
    await reportNativePushEvent('c1', 'clicked', f);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ endpoint: `fcm:${TOKEN}`, campaign: 'c1', event: 'clicked' });
  });
});
