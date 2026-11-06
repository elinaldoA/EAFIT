// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-11-20' }));
vi.mock('../lib/trainerCharges', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerCharges: (...a) => h.api.fetchTrainerCharges(...a),
  createCharge: (...a) => h.api.createCharge(...a),
  markChargePaid: (...a) => h.api.markChargePaid(...a),
  reopenCharge: (...a) => h.api.reopenCharge(...a),
  cancelCharge: (...a) => h.api.cancelCharge(...a),
}));

import ClientCharges from './ClientCharges';

const CLIENT = { id: 'c1', name: 'Ana' };
const LATE = { id: 'h1', clientId: 'c1', description: 'Mensalidade out', amount: 15000, due: '2026-11-10', status: 'open', paidAt: null, method: null, note: 'Pix: 123' };
const PAID = { id: 'h2', clientId: 'c1', description: 'Mensalidade set', amount: 15000, due: '2026-09-10', status: 'paid', paidAt: new Date(2026, 10, 3, 12).toISOString(), method: 'pix', note: null };

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchTrainerCharges: vi.fn().mockResolvedValue([LATE, PAID]),
    createCharge: vi.fn().mockResolvedValue(undefined),
    markChargePaid: vi.fn().mockResolvedValue(undefined),
    reopenCharge: vi.fn().mockResolvedValue(undefined),
    cancelCharge: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const registrar = () => screen.getByRole('button', { name: 'Registrar cobrança e avisar o aluno' });

describe('ClientCharges', () => {
  it('lista as cobranças com estado, atraso e observação', async () => {
    render(<ClientCharges client={CLIENT} />);
    expect(await screen.findByText('Mensalidade out')).toBeTruthy();
    expect(screen.getByText('Em atraso')).toBeTruthy();
    expect(screen.getByText(/10 dia\(s\) de atraso/)).toBeTruthy();
    expect(screen.getByText('Pix: 123')).toBeTruthy();
    expect(screen.getByText('Pago')).toBeTruthy();
    expect(h.api.fetchTrainerCharges).toHaveBeenCalledWith('c1');
  });

  it('sem cobranças mostra o vazio; falha ao carregar também', async () => {
    h.api.fetchTrainerCharges.mockResolvedValue([]);
    render(<ClientCharges client={CLIENT} />);
    expect(await screen.findByText('Nenhuma cobrança registrada.')).toBeTruthy();
    cleanup();
    h.api.fetchTrainerCharges.mockRejectedValue(new Error('x'));
    render(<ClientCharges client={CLIENT} />);
    expect(await screen.findByText('Nenhuma cobrança registrada.')).toBeTruthy();
  });

  it('o botão de registrar só habilita com descrição, valor válido e vencimento', async () => {
    render(<ClientCharges client={CLIENT} />);
    await screen.findByText('Mensalidade out');
    expect(registrar().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Mensalidade' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Vencimento'), { target: { value: '2026-12-05' } });
    expect(registrar().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '150,50' } });
    expect(registrar().disabled).toBe(false);
  });

  it('registra a cobrança mensal, limpa o formulário e recarrega', async () => {
    render(<ClientCharges client={CLIENT} />);
    await screen.findByText('Mensalidade out');
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: '  Mensalidade ' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '150,50' } });
    fireEvent.change(screen.getByLabelText('Vencimento'), { target: { value: '2026-12-05' } });
    fireEvent.change(screen.getByLabelText('Repetir'), { target: { value: '3' } });
    fireEvent.click(registrar());

    await waitFor(() => expect(h.api.createCharge).toHaveBeenCalledWith('c1', {
      description: 'Mensalidade', amountCents: 15050, due: '2026-12-05', months: 3, note: '',
    }));
    expect(h.toast).toHaveBeenCalledWith('💰 Cobrança registrada. O aluno foi avisado');
    expect(screen.getByLabelText('Descrição').value).toBe('');
    await waitFor(() => expect(h.api.fetchTrainerCharges).toHaveBeenCalledTimes(2));
  });

  it('mostra o erro amigável quando o servidor recusa', async () => {
    h.api.createCharge.mockRejectedValue(new Error('too_many'));
    render(<ClientCharges client={CLIENT} />);
    await screen.findByText('Mensalidade out');
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Vencimento'), { target: { value: '2026-12-05' } });
    fireEvent.click(registrar());
    expect((await screen.findByRole('alert')).textContent).toMatch(/Muitas cobranças/);
  });

  it('dá baixa com a forma de pagamento escolhida', async () => {
    render(<ClientCharges client={CLIENT} />);
    await screen.findByText('Mensalidade out');
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'cash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dar baixa' }));
    await waitFor(() => expect(h.api.markChargePaid).toHaveBeenCalledWith('h1', 'cash'));
    expect(h.toast).toHaveBeenCalledWith('✅ Pagamento registrado');
  });

  it('desfaz a baixa de uma cobrança paga', async () => {
    render(<ClientCharges client={CLIENT} />);
    await screen.findByText('Mensalidade set');
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer baixa' }));
    await waitFor(() => expect(h.api.reopenCharge).toHaveBeenCalledWith('h2'));
  });

  it('cancelar pede confirmação', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ClientCharges client={CLIENT} />);
    await screen.findByText('Mensalidade out');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(h.api.cancelCharge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(h.api.cancelCharge).toHaveBeenCalledWith('h1'));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
