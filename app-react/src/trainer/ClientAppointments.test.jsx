// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainerAppointments', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerAppointments: (...a) => h.api.fetchTrainerAppointments(...a),
  createAppointment: (...a) => h.api.createAppointment(...a),
  cancelAppointment: (...a) => h.api.cancelAppointment(...a),
}));

import ClientAppointments from './ClientAppointments';

const CLIENT = { id: 'c1', name: 'Ana' };
const APPT = { id: 'a1', starts: '2026-10-20T21:30:00Z', duration: 60, place: 'Academia', note: 'Leve', status: 'confirmed' };

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchTrainerAppointments: vi.fn().mockResolvedValue([APPT]),
    createAppointment: vi.fn().mockResolvedValue(undefined),
    cancelAppointment: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const marcar = () => screen.getByRole('button', { name: 'Marcar aula e avisar o aluno' });

describe('ClientAppointments', () => {
  it('lista as aulas do aluno com local, observação e status', async () => {
    render(<ClientAppointments client={CLIENT} />);
    expect(await screen.findByText(/Academia/)).toBeTruthy();
    expect(screen.getByText('Leve')).toBeTruthy();
    expect(screen.getByText('Confirmada')).toBeTruthy();
    expect(h.api.fetchTrainerAppointments).toHaveBeenCalledWith('c1');
  });

  it('sem aulas mostra o vazio; falha ao carregar também', async () => {
    h.api.fetchTrainerAppointments.mockResolvedValue([]);
    render(<ClientAppointments client={CLIENT} />);
    expect(await screen.findByText('Nenhuma aula marcada.')).toBeTruthy();
    cleanup();
    h.api.fetchTrainerAppointments.mockRejectedValue(new Error('x'));
    render(<ClientAppointments client={CLIENT} />);
    expect(await screen.findByText('Nenhuma aula marcada.')).toBeTruthy();
  });

  it('o botão de marcar só habilita com data e hora', async () => {
    render(<ClientAppointments client={CLIENT} />);
    await screen.findByText(/Academia/);
    expect(marcar().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Data e hora'), { target: { value: '2026-10-25T18:30' } });
    expect(marcar().disabled).toBe(false);
  });

  it('marca a aula com duração, local e observação, limpa o formulário e recarrega', async () => {
    render(<ClientAppointments client={CLIENT} />);
    await screen.findByText(/Academia/);
    fireEvent.change(screen.getByLabelText('Data e hora'), { target: { value: '2026-10-25T18:30' } });
    fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '90' } });
    fireEvent.change(screen.getByPlaceholderText('Local (opcional)'), { target: { value: '  Studio  ' } });
    fireEvent.change(screen.getByPlaceholderText('Observação (opcional)'), { target: { value: 'Pernas' } });
    fireEvent.click(marcar());

    await waitFor(() => expect(h.api.createAppointment).toHaveBeenCalledWith('c1', {
      startsIso: new Date('2026-10-25T18:30').toISOString(), duration: 90, place: 'Studio', note: 'Pernas',
    }));
    expect(h.toast).toHaveBeenCalledWith('📅 Aula marcada. O aluno foi avisado');
    expect(screen.getByLabelText('Data e hora').value).toBe('');
    await waitFor(() => expect(h.api.fetchTrainerAppointments).toHaveBeenCalledTimes(2));
  });

  it('erro do servidor aparece como mensagem', async () => {
    h.api.createAppointment.mockRejectedValue(new Error('invalid_time'));
    render(<ClientAppointments client={CLIENT} />);
    await screen.findByText(/Academia/);
    fireEvent.change(screen.getByLabelText('Data e hora'), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(marcar());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no futuro/));
  });

  it('cancelar pede confirmação e recarrega; só aparece em aulas ativas', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    h.api.fetchTrainerAppointments.mockResolvedValue([APPT, { ...APPT, id: 'a2', status: 'cancelled' }, { ...APPT, id: 'a3', status: 'declined' }]);
    render(<ClientAppointments client={CLIENT} />);
    await screen.findAllByText(/Academia/);
    const cancels = screen.getAllByRole('button', { name: 'Cancelar' });
    expect(cancels).toHaveLength(1);

    fireEvent.click(cancels[0]);
    expect(h.api.cancelAppointment).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(cancels[0]);
    await waitFor(() => expect(h.api.cancelAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' })));
    expect(h.toast).toHaveBeenCalledWith('Aula cancelada');
  });

  it('erro ao cancelar avisa com toast', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.cancelAppointment.mockRejectedValue(new Error('not_found'));
    render(<ClientAppointments client={CLIENT} />);
    await screen.findByText(/Academia/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('❌')));
  });
});
