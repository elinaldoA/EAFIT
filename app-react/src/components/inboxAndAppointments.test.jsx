// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  api: {},
  reminders: [false, vi.fn()],
  notifSupported: true,
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../hooks/useReminders', () => ({ useReminders: () => h.reminders }));
vi.mock('../lib/notifications', () => ({ isNotificationSupported: () => h.notifSupported }));
vi.mock('../lib/inbox', async (importActual) => ({
  ...(await importActual()),
  fetchInbox: (...a) => h.api.fetchInbox(...a),
  markInboxRead: (...a) => h.api.markInboxRead(...a),
  markInboxItemRead: (...a) => h.api.markInboxItemRead(...a),
}));
vi.mock('../lib/trainerAppointments', async (importActual) => ({
  ...(await importActual()),
  fetchMyAppointments: (...a) => h.api.fetchMyAppointments(...a),
  respondAppointment: (...a) => h.api.respondAppointment(...a),
}));

import InboxBell from './InboxBell';
import MyAppointments from './MyAppointments';

const flush = () => act(async () => { await Promise.resolve(); });
const item = (id, o = {}) => ({ id, title: `Aviso ${id}`, body: `corpo ${id}`, created_at: new Date().toISOString(), read_at: null, ...o });

beforeEach(() => {
  h.toast.mockReset();
  h.reminders = [false, vi.fn()];
  h.notifSupported = true;
  h.api = {
    fetchInbox: vi.fn().mockResolvedValue([]),
    markInboxRead: vi.fn().mockResolvedValue(undefined),
    markInboxItemRead: vi.fn().mockResolvedValue(undefined),
    fetchMyAppointments: vi.fn().mockResolvedValue([]),
    respondAppointment: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('InboxBell', () => {
  it('sem avisos novos: sino simples, sem contador', async () => {
    render(<InboxBell />);
    await flush();
    expect(screen.getByRole('button', { name: 'Avisos' })).toBeTruthy();
    expect(document.querySelector('.inbox-bell__badge')).toBeNull();
  });

  it('mostra quantos são novos e "9+" acima de nove', async () => {
    h.api.fetchInbox.mockResolvedValue([item(1), item(2, { read_at: 'x' })]);
    render(<InboxBell />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Avisos (1 novo(s))' })).toBeTruthy());
    expect(document.querySelector('.inbox-bell__badge').textContent).toBe('1');
    cleanup();

    h.api.fetchInbox.mockResolvedValue(Array.from({ length: 12 }, (_, i) => item(i)));
    render(<InboxBell />);
    await waitFor(() => expect(document.querySelector('.inbox-bell__badge')?.textContent).toBe('9+'));
  });

  const openWith = async (rows) => {
    h.api.fetchInbox.mockResolvedValue(rows);
    render(<InboxBell />);
    await waitFor(() => expect(document.querySelector('.inbox-bell__badge')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Avisos/ }));
  };

  it('abrir lista os avisos sem marcar nada; fechar mantém os não lidos', async () => {
    await openWith([item(1), item(2)]);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Aviso 1')).toBeTruthy();
    expect(document.querySelectorAll('.inbox__item--unread')).toHaveLength(2);
    expect(screen.getByText('2 não lido(s)')).toBeTruthy();
    expect(h.api.markInboxRead).not.toHaveBeenCalled();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(false);
    expect(document.querySelector('.inbox-bell__badge').textContent).toBe('2');
  });

  it('marca um aviso como lido e o contador desce', async () => {
    await openWith([item(1), item(2), item(3, { read_at: 'x' })]);
    const buttons = screen.getAllByRole('button', { name: 'Marcar como lido' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    await flush();
    expect(h.api.markInboxItemRead).toHaveBeenCalledWith(2);
    expect(document.querySelectorAll('.inbox__item--unread')).toHaveLength(1);
    expect(document.querySelector('.inbox-bell__badge').textContent).toBe('1');
  });

  it('marca todos como lidos e some com o contador', async () => {
    await openWith([item(1), item(2)]);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todos como lidos' }));
    await flush();
    expect(h.api.markInboxRead).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.inbox__item--unread')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Marcar todos como lidos' })).toBeNull();
    expect(document.querySelector('.inbox-bell__badge')).toBeNull();
  });

  it('falha ao marcar devolve o destaque e avisa', async () => {
    h.api.markInboxItemRead.mockRejectedValue(new Error('offline'));
    await openWith([item(1)]);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como lido' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Não foi possível marcar como lido. Tente de novo.'));
    expect(document.querySelectorAll('.inbox__item--unread')).toHaveLength(1);
  });

  it('sem avisos novos, abrir não marca nada e mostra o vazio', async () => {
    render(<InboxBell />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Avisos' }));
    expect(h.api.markInboxRead).not.toHaveBeenCalled();
    expect(screen.getByText('Nenhum aviso por enquanto.')).toBeTruthy();
  });

  it('falha ao carregar conta como sem avisos', async () => {
    h.api.fetchInbox.mockRejectedValue(new Error('offline'));
    render(<InboxBell />);
    await flush();
    expect(document.querySelector('.inbox-bell__badge')).toBeNull();
  });

  it('o liga/desliga dos lembretes chama o fluxo; sem suporte fica desabilitado', async () => {
    render(<InboxBell />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Avisos' }));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(h.reminders[1]).toHaveBeenCalled();
    cleanup();

    h.notifSupported = false;
    render(<InboxBell />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Avisos' }));
    expect(screen.getByRole('checkbox').disabled).toBe(true);
    expect(screen.getByText('Notificações não são suportadas neste navegador.')).toBeTruthy();
  });

  it('relê a cada 2 minutos e ao voltar para o app', async () => {
    vi.useFakeTimers();
    render(<InboxBell />);
    await flush();
    expect(h.api.fetchInbox).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(120000); });
    expect(h.api.fetchInbox).toHaveBeenCalledTimes(2);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.api.fetchInbox).toHaveBeenCalledTimes(3);
  });
});

describe('MyAppointments', () => {
  const future = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();
  const appt = (id, status, o = {}) => ({ id, status, starts: future(48), duration: 60, place: '', note: '', ...o });

  it('sem aulas não mostra nada', async () => {
    const { container } = render(<MyAppointments />);
    await flush();
    expect(container.firstChild).toBeNull();
  });

  it('lista completa: situação, local, observação e ações das futuras', async () => {
    h.api.fetchMyAppointments.mockResolvedValue([
      appt(1, 'pending', { place: 'Academia X', note: 'trazer toalha' }),
      appt(2, 'confirmed'),
    ]);
    render(<MyAppointments />);
    expect(await screen.findByText('Aulas com o personal', { exact: false })).toBeTruthy();
    expect(screen.getByText('Aguardando confirmação')).toBeTruthy();
    expect(screen.getByText('Confirmada')).toBeTruthy();
    expect(screen.getByText(/Academia X/)).toBeTruthy();
    expect(screen.getByText('trazer toalha')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Recusar' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Confirmar' })).toHaveLength(1); // a confirmada já não oferece
  });

  it('canceladas passadas e aulas já realizadas não têm ações', async () => {
    h.api.fetchMyAppointments.mockResolvedValue([
      appt(1, 'cancelled', { starts: future(-72) }),
      appt(2, 'confirmed', { starts: future(-72) }),
    ]);
    render(<MyAppointments />);
    expect(await screen.findByText('Confirmada')).toBeTruthy();
    expect(screen.queryByText('Cancelada')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recusar' })).toBeNull();
  });

  it('onlyPending mostra só os convites aguardando, sem situação', async () => {
    h.api.fetchMyAppointments.mockResolvedValue([appt(1, 'pending'), appt(2, 'confirmed')]);
    render(<MyAppointments onlyPending />);
    expect(await screen.findByText('Seu personal marcou uma aula', { exact: false })).toBeTruthy();
    expect(document.querySelectorAll('.appt')).toHaveLength(1);
    expect(screen.queryByText('Aguardando confirmação')).toBeNull();
  });

  it('onlyPending sem convites não aparece', async () => {
    h.api.fetchMyAppointments.mockResolvedValue([appt(2, 'confirmed')]);
    const { container } = render(<MyAppointments onlyPending />);
    await flush();
    expect(container.firstChild).toBeNull();
  });

  it('confirmar avisa e recarrega', async () => {
    h.api.fetchMyAppointments.mockResolvedValue([appt(7, 'pending')]);
    render(<MyAppointments />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('✅ Aula confirmada'));
    expect(h.api.respondAppointment).toHaveBeenCalledWith(7, 'confirmed');
    expect(h.api.fetchMyAppointments).toHaveBeenCalledTimes(2);
  });

  it('recusar avisa', async () => {
    h.api.fetchMyAppointments.mockResolvedValue([appt(7, 'pending')]);
    render(<MyAppointments />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recusar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Aula recusada'));
    expect(h.api.respondAppointment).toHaveBeenCalledWith(7, 'declined');
  });

  it('erro ao responder avisa e recarrega', async () => {
    h.api.fetchMyAppointments.mockResolvedValue([appt(7, 'pending')]);
    h.api.respondAppointment.mockRejectedValue(new Error('boom'));
    render(<MyAppointments />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('❌')));
    expect(h.api.fetchMyAppointments).toHaveBeenCalledTimes(2);
  });
});
