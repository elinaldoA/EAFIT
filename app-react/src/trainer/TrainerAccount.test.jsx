// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  logout: vi.fn(),
  toast: vi.fn(),
  toggleNotify: vi.fn(),
  notifyOn: { value: false },
  supported: { value: true },
  api: {},
  startTutorial: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 't1', email: 'p@x.com', user_metadata: { nome: 'Carlos' } }, logout: h.logout }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../hooks/useReminders', () => ({ useReminders: () => [h.notifyOn.value, h.toggleNotify] }));
vi.mock('../lib/notifications', () => ({ isNotificationSupported: () => h.supported.value }));
vi.mock('../lib/tutorial', () => ({ startTutorial: (...a) => h.startTutorial(...a) }));
vi.mock('../lib/trainerSettings', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerSettings: (...a) => h.api.fetchTrainerSettings(...a),
  saveTrainerSettings: (...a) => h.api.saveTrainerSettings(...a),
}));

import TrainerAccount from './TrainerAccount';

beforeEach(() => {
  h.logout.mockReset();
  h.toast.mockReset();
  h.toggleNotify.mockReset();
  h.startTutorial.mockReset();
  h.notifyOn.value = false;
  h.supported.value = true;
  h.api = {
    fetchTrainerSettings: vi.fn().mockResolvedValue({ inactive: true, pr: true, pain: false, weekly: true, days: 7 }),
    saveTrainerSettings: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TrainerAccount', () => {
  it('mostra o nome e o e-mail do personal', async () => {
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    expect(screen.getByText(/p@x.com/)).toBeTruthy();
    await waitFor(() => expect(h.api.fetchTrainerSettings).toHaveBeenCalled());
  });

  it('Usar como aluno, Ver tutorial e Sair chamam as ações', async () => {
    const onSwitchToStudent = vi.fn();
    render(<TrainerAccount onSwitchToStudent={onSwitchToStudent} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar como aluno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver tutorial' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    expect(onSwitchToStudent).toHaveBeenCalledTimes(1);
    expect(h.startTutorial).toHaveBeenCalledTimes(1);
    expect(h.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.api.fetchTrainerSettings).toHaveBeenCalled());
  });

  it('o botão de notificações reflete o estado e dispara o liga/desliga', async () => {
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '🔔 Ativar notificações neste aparelho' }));
    expect(h.toggleNotify).toHaveBeenCalledTimes(1);
    cleanup();
    h.notifyOn.value = true;
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    expect(screen.getByRole('button', { name: '🔕 Desativar notificações neste aparelho' })).toBeTruthy();
    await waitFor(() => expect(h.api.fetchTrainerSettings).toHaveBeenCalled());
  });

  it('navegador sem suporte desabilita o botão de notificações', async () => {
    h.supported.value = false;
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    expect(screen.getByRole('button', { name: /notificações neste aparelho/ }).disabled).toBe(true);
    await waitFor(() => expect(h.api.fetchTrainerSettings).toHaveBeenCalled());
  });

  it('mostra as opções de alerta com o estado salvo e salva ao mudar', async () => {
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    const painBox = boxes[2];
    expect(painBox.checked).toBe(false);
    fireEvent.click(painBox);
    await waitFor(() => expect(h.api.saveTrainerSettings).toHaveBeenCalledWith(expect.objectContaining({ pain: true })));
  });

  it('o limite de dias sem treinar só aparece com o alerta de inatividade ligado', async () => {
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    const select = await screen.findByLabelText(/Considerar "sem treinar" após/);
    expect(select.value).toBe('7');
    fireEvent.change(select, { target: { value: '14' } });
    await waitFor(() => expect(h.api.saveTrainerSettings).toHaveBeenCalledWith(expect.objectContaining({ days: 14 })));

    cleanup();
    h.api.fetchTrainerSettings.mockResolvedValue({ inactive: false, pr: true, pain: true, weekly: true, days: 7 });
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    await screen.findAllByRole('checkbox');
    expect(screen.queryByLabelText(/Considerar "sem treinar" após/)).toBeNull();
  });

  it('erro ao salvar avisa', async () => {
    h.api.saveTrainerSettings.mockRejectedValue(new Error('x'));
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível salvar'));
  });

  it('falha ao carregar usa as configurações padrão', async () => {
    h.api.fetchTrainerSettings.mockRejectedValue(new Error('x'));
    render(<TrainerAccount onSwitchToStudent={() => {}} />);
    expect((await screen.findAllByRole('checkbox')).length).toBeGreaterThanOrEqual(3);
  });
});
