// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  auth: {},
  today: '2026-10-07',
  api: {},
  reminders: [false, vi.fn()],
  notifSupported: true,
  pushSupported: true,
  sw: { needRefresh: false, updateServiceWorker: vi.fn(), opts: null },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => h.today }));
vi.mock('../hooks/useReminders', () => ({ useReminders: () => h.reminders }));
vi.mock('../lib/notifications', () => ({ isNotificationSupported: () => h.notifSupported }));
vi.mock('../lib/pushSubscriptions', () => ({ isPushSupported: () => h.pushSupported }));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  fetchMyMessages: (...a) => h.api.fetchMyMessages(...a),
  markMessagesRead: (...a) => h.api.markMessagesRead(...a),
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (opts) => {
    h.sw.opts = opts;
    return { needRefresh: [h.sw.needRefresh], updateServiceWorker: h.sw.updateServiceWorker };
  },
}));

import RatingModal from './RatingModal';
import PauseBanner from './PauseBanner';
import PersonalMessages from './PersonalMessages';
import PushPrompt from './PushPrompt';
import UpdatePrompt from './UpdatePrompt';
import { RATING_OPTIONS } from '../lib/ratingOptions';

beforeEach(() => {
  localStorage.clear();
  h.toast.mockReset();
  h.today = '2026-10-07';
  h.auth = { user: { id: 'u1', user_metadata: {} }, updateProfile: vi.fn().mockResolvedValue({ error: null }) };
  h.api = {
    fetchMyMessages: vi.fn().mockResolvedValue([]),
    markMessagesRead: vi.fn().mockResolvedValue(undefined),
  };
  h.reminders = [false, vi.fn().mockResolvedValue(undefined)];
  h.notifSupported = true;
  h.pushSupported = true;
  h.sw.needRefresh = false;
  h.sw.updateServiceWorker = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RatingModal', () => {
  it('lista as opções, marca a escolhida e seleciona ao clicar', () => {
    const onSelect = vi.fn();
    const sel = RATING_OPTIONS[1];
    render(<RatingModal value={sel.value} onSelect={onSelect} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    const buttons = RATING_OPTIONS.map(o => screen.getByRole('button', { name: o.label }));
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith(RATING_OPTIONS[0].value);
  });

  it('✕ e o fundo fecham', () => {
    const onClose = vi.fn();
    const { baseElement } = render(<RatingModal value={null} onSelect={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(baseElement.querySelector('.rating-modal__backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('PauseBanner', () => {
  const paused = () => ({ user: { id: 'u1', user_metadata: { pausedUntil: '2026-10-20' } }, updateProfile: h.auth.updateProfile });

  it('sem pausa ativa não aparece', () => {
    const { container } = render(<PauseBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('com pausa ativa mostra até quando', () => {
    h.auth = paused();
    render(<PauseBanner />);
    expect(screen.getByRole('status').textContent).toContain('20/10');
  });

  it('Retomar encerra a pausa e avisa', async () => {
    h.auth = paused();
    render(<PauseBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('▶️ Pausa encerrada. Bom treino!'));
    expect(h.auth.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('erro ao retomar mostra a mensagem', async () => {
    h.auth = paused();
    h.auth.updateProfile.mockResolvedValue({ error: { message: 'falhou' } });
    render(<PauseBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ falhou'));
  });
});

describe('PersonalMessages', () => {
  const msg = (id, body, read = false) => ({ id, body, read });

  it('sem recado novo não aparece', async () => {
    h.api.fetchMyMessages.mockResolvedValue([msg(1, 'antigo', true)]);
    const { container } = render(<PersonalMessages />);
    await waitFor(() => expect(h.api.fetchMyMessages).toHaveBeenCalledWith(5));
    expect(container.firstChild).toBeNull();
  });

  it('sem usuário não busca', () => {
    h.auth = { user: null };
    render(<PersonalMessages />);
    expect(h.api.fetchMyMessages).not.toHaveBeenCalled();
  });

  it('um recado novo: título no singular e o texto', async () => {
    h.api.fetchMyMessages.mockResolvedValue([msg(1, 'Bom treino!')]);
    render(<PersonalMessages />);
    expect(await screen.findByText('Bom treino!')).toBeTruthy();
    expect(screen.getByText(/Recado do seu personal/)).toBeTruthy();
  });

  it('vários recados: título no plural e só os não lidos', async () => {
    h.api.fetchMyMessages.mockResolvedValue([msg(1, 'um'), msg(2, 'dois'), msg(3, 'velho', true)]);
    render(<PersonalMessages />);
    expect(await screen.findByText(/2 recados do seu personal/)).toBeTruthy();
    expect(screen.queryByText('velho')).toBeNull();
  });

  it('Entendi some com a faixa e marca como lido', async () => {
    h.api.fetchMyMessages.mockResolvedValue([msg(1, 'oi')]);
    render(<PersonalMessages />);
    fireEvent.click(await screen.findByRole('button', { name: 'Entendi' }));
    expect(screen.queryByText('oi')).toBeNull();
    await waitFor(() => expect(h.api.markMessagesRead).toHaveBeenCalled());
  });

  it('falha ao marcar como lido não quebra', async () => {
    h.api.fetchMyMessages.mockResolvedValue([msg(1, 'oi')]);
    h.api.markMessagesRead.mockRejectedValue(new Error('x'));
    render(<PersonalMessages />);
    fireEvent.click(await screen.findByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.queryByText('oi')).toBeNull();
  });

  it('falha ao buscar simplesmente não mostra', async () => {
    h.api.fetchMyMessages.mockRejectedValue(new Error('sem personal'));
    const { container } = render(<PersonalMessages />);
    await waitFor(() => expect(h.api.fetchMyMessages).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('Ver histórico leva ao perfil', async () => {
    h.api.fetchMyMessages.mockResolvedValue([msg(1, 'oi')]);
    render(<PersonalMessages />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver histórico' }));
    expect(window.location.hash).toBe('#perfil');
  });
});

describe('PushPrompt', () => {
  const setPermission = (p) => Object.defineProperty(globalThis, 'Notification', { configurable: true, value: { permission: p } });

  beforeEach(() => setPermission('default'));

  it('oferece os lembretes quando ainda faz sentido', () => {
    render(<PushPrompt />);
    expect(screen.getByText('🔔 Quer ser lembrado de treinar?')).toBeTruthy();
  });

  it('não oferece sem suporte, com permissão negada ou com lembretes já ativos', () => {
    h.notifSupported = false;
    const a = render(<PushPrompt />);
    expect(a.container.firstChild).toBeNull();
    a.unmount();

    h.notifSupported = true;
    setPermission('denied');
    const b = render(<PushPrompt />);
    expect(b.container.firstChild).toBeNull();
    b.unmount();

    setPermission('default');
    h.reminders = [true, vi.fn()];
    const c = render(<PushPrompt />);
    expect(c.container.firstChild).toBeNull();
  });

  it('Ativar lembretes liga o fluxo e esconde o convite', async () => {
    render(<PushPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar lembretes' }));
    await waitFor(() => expect(screen.queryByText(/Quer ser lembrado/)).toBeNull());
    expect(h.reminders[1]).toHaveBeenCalledTimes(1);
  });

  it('Agora não guarda a data e esconde; não volta a aparecer logo depois', () => {
    const { unmount } = render(<PushPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText(/Quer ser lembrado/)).toBeNull();
    expect(localStorage.getItem('eafit_push_prompt_dismissed_at')).toBeTruthy();
    unmount();
    const again = render(<PushPrompt />);
    expect(again.container.firstChild).toBeNull();
  });
});

describe('UpdatePrompt', () => {
  it('sem versão nova não aparece', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('com versão nova mostra o cartão e Depois dispensa', () => {
    h.sw.needRefresh = true;
    render(<UpdatePrompt aboveNav />);
    const card = screen.getByRole('alert');
    expect(card.className).toContain('update-card--above-nav');
    fireEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('logo após atualizar fica suprimido por 10 minutos e depois volta', () => {
    vi.useFakeTimers();
    h.sw.needRefresh = true;
    localStorage.setItem('eafit_sw_updated_at', String(Date.now()));
    render(<UpdatePrompt />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => { vi.advanceTimersByTime(10 * 60_000 + 10); });
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('Atualizar guarda a trava, ativa o SW novo e recarrega ao assumir a página', () => {
    vi.useFakeTimers();
    h.sw.needRefresh = true;
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    const sw = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });

    render(<UpdatePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(h.sw.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(localStorage.getItem('eafit_sw_updated_at')).toBeTruthy();

    sw.dispatchEvent(new Event('controllerchange'));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(reload).toHaveBeenCalledTimes(1); // só uma vez, mesmo com o fallback

    Object.defineProperty(window, 'location', { configurable: true, value: original });
    delete navigator.serviceWorker;
  });

  it('sem o evento do SW, o fallback recarrega após 5s', () => {
    vi.useFakeTimers();
    h.sw.needRefresh = true;
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    render(<UpdatePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(reload).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('checa atualização no intervalo e ao voltar para o app, exceto logo após atualizar', () => {
    vi.useFakeTimers();
    const update = vi.fn().mockResolvedValue(undefined);
    render(<UpdatePrompt />);
    act(() => { h.sw.opts.onRegisteredSW('/sw.js', { update }); });

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(update).toHaveBeenCalledTimes(1);

    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(update).toHaveBeenCalledTimes(2);

    localStorage.setItem('eafit_sw_updated_at', String(Date.now()));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(update).toHaveBeenCalledTimes(2);
  });
});
