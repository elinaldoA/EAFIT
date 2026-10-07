// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ user: { id: 'u1' }, toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('../lib/checkin', async (importActual) => ({
  ...(await importActual()),
  fetchCheckins: (...a) => h.api.fetchCheckins(...a),
  saveCheckin: (...a) => h.api.saveCheckin(...a),
}));

import DailyCheckin from './DailyCheckin';

const pick = (label, n) => fireEvent.click(screen.getByRole('radio', { name: `${label} ${n} de 5` }));

beforeEach(() => {
  h.user = { id: 'u1' };
  h.toast.mockReset();
  h.api = {
    fetchCheckins: vi.fn().mockResolvedValue([]),
    saveCheckin: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DailyCheckin', () => {
  it('não aparece sem usuário nem enquanto carrega', () => {
    h.user = null;
    const { container } = render(<DailyCheckin />);
    expect(container.firstChild).toBeNull();
    expect(h.api.fetchCheckins).not.toHaveBeenCalled();
  });

  it('sem check-in de hoje mostra as três escalas e Registrar desabilitado', async () => {
    render(<DailyCheckin />);
    expect(await screen.findByText('Como você está hoje?')).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(true);
    expect(h.api.fetchCheckins).toHaveBeenCalledWith('u1', '2026-10-07');
  });

  it('só habilita Registrar com energia, sono e humor escolhidos', async () => {
    render(<DailyCheckin />);
    await screen.findByText('Como você está hoje?');
    pick('Energia', 4);
    pick('Sono', 3);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(true);
    pick('Humor', 5);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(false);
    expect(screen.getByRole('radio', { name: 'Energia 4 de 5' }).getAttribute('aria-checked')).toBe('true');
  });

  it('registrar salva, avisa e troca para a linha com a dica do dia', async () => {
    render(<DailyCheckin />);
    await screen.findByText('Como você está hoje?');
    pick('Energia', 5); pick('Sono', 4); pick('Humor', 5);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(h.api.saveCheckin).toHaveBeenCalledWith('u1', '2026-10-07', { energy: 5, sleep: 4, mood: 5 }));
    expect(h.toast).toHaveBeenCalledWith('✅ Check-in registrado');
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refazer' })).toBeTruthy();
  });

  it('erro ao salvar avisa e mantém o formulário', async () => {
    h.api.saveCheckin.mockRejectedValue(new Error('rede'));
    render(<DailyCheckin />);
    await screen.findByText('Como você está hoje?');
    pick('Energia', 3); pick('Sono', 3); pick('Humor', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível salvar o check-in'));
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeTruthy();
  });

  it('com check-in de hoje já respondido mostra a dica; Refazer reabre com as respostas', async () => {
    h.api.fetchCheckins.mockResolvedValue([{ checkin_date: '2026-10-07', energy: 5, sleep: 4, mood: 4 }]);
    render(<DailyCheckin />);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByText('Como você está hoje?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
    expect(screen.getByText('Como você está hoje?')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Energia 5 de 5' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(false);
  });

  it('check-in de outro dia não conta como o de hoje', async () => {
    h.api.fetchCheckins.mockResolvedValue([{ checkin_date: '2026-10-06', energy: 5, sleep: 4, mood: 4 }]);
    render(<DailyCheckin />);
    expect(await screen.findByText('Como você está hoje?')).toBeTruthy();
  });

  it('falha ao buscar ainda mostra o formulário', async () => {
    h.api.fetchCheckins.mockRejectedValue(new Error('rede'));
    render(<DailyCheckin />);
    expect(await screen.findByText('Como você está hoje?')).toBeTruthy();
  });
});
