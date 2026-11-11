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
import { markTutorialSeen } from '../lib/tutorial';

const TITLE = 'Como você está hoje?';
const pick = (label, n) => fireEvent.click(screen.getByRole('radio', { name: `${label} ${n} de 5` }));
const modal = () => screen.queryByRole('dialog');

beforeEach(() => {
  localStorage.clear();
  document.body.classList.remove('modal-open');
  markTutorialSeen('aluno', 'u1');
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

describe('DailyCheckin (modal)', () => {
  it('não aparece sem usuário nem enquanto carrega', () => {
    h.user = null;
    const { container } = render(<DailyCheckin />);
    expect(container.firstChild).toBeNull();
    expect(h.api.fetchCheckins).not.toHaveBeenCalled();
  });

  it('sem check-in de hoje abre o modal sozinho, com as três escalas e Registrar desabilitado', async () => {
    render(<DailyCheckin />);
    expect(await screen.findByRole('dialog', { name: TITLE })).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(true);
    expect(h.api.fetchCheckins).toHaveBeenCalledWith('u1', '2026-10-07');
    // O card com as escalas não existe mais na página: só a linha com o botão.
    expect(screen.getByRole('button', { name: 'Fazer check-in' })).toBeTruthy();
  });

  it('só habilita Registrar com energia, sono e humor escolhidos', async () => {
    render(<DailyCheckin />);
    await screen.findByRole('dialog');
    pick('Energia', 4);
    pick('Sono', 3);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(true);
    pick('Humor', 5);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(false);
    expect(screen.getByRole('radio', { name: 'Energia 4 de 5' }).getAttribute('aria-checked')).toBe('true');
  });

  it('registrar salva, avisa, fecha o modal e mostra a linha com a dica do dia', async () => {
    const onChange = vi.fn();
    render(<DailyCheckin onChange={onChange} />);
    await screen.findByRole('dialog');
    pick('Energia', 5); pick('Sono', 4); pick('Humor', 5);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(h.api.saveCheckin).toHaveBeenCalledWith('u1', '2026-10-07', { energy: 5, sleep: 4, mood: 5 }));
    expect(h.toast).toHaveBeenCalledWith('✅ Check-in registrado');
    await waitFor(() => expect(modal()).toBeNull());
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refazer' })).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith({ energy: 5, sleep: 4, mood: 5 });
  });

  it('erro ao salvar avisa e mantém o modal aberto com as respostas', async () => {
    h.api.saveCheckin.mockRejectedValue(new Error('rede'));
    render(<DailyCheckin />);
    await screen.findByRole('dialog');
    pick('Energia', 3); pick('Sono', 3); pick('Humor', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível salvar o check-in'));
    expect(modal()).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Energia 3 de 5' }).getAttribute('aria-checked')).toBe('true');
  });

  it('Agora não fecha e não reabre no mesmo dia; o botão da linha abre de novo', async () => {
    const first = render(<DailyCheckin />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(modal()).toBeNull();
    expect(h.api.saveCheckin).not.toHaveBeenCalled();

    // Volta ao Treino no mesmo dia: não abre sozinho.
    first.unmount();
    render(<DailyCheckin />);
    await screen.findByRole('button', { name: 'Fazer check-in' });
    expect(modal()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }));
    expect(await screen.findByRole('dialog', { name: TITLE })).toBeTruthy();
  });

  it('com check-in de hoje já respondido não abre; Refazer abre o modal com as respostas', async () => {
    h.api.fetchCheckins.mockResolvedValue([{ checkin_date: '2026-10-07', energy: 5, sleep: 4, mood: 4 }]);
    render(<DailyCheckin />);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(modal()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
    expect(screen.getByRole('dialog', { name: TITLE })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Energia 5 de 5' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(false);
  });

  it('fechar o modal do Refazer não apaga a resposta nem marca "agora não"', async () => {
    h.api.fetchCheckins.mockResolvedValue([{ checkin_date: '2026-10-07', energy: 5, sleep: 4, mood: 4 }]);
    render(<DailyCheckin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refazer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(modal()).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(localStorage.getItem('eafit_checkin_skip:u1')).toBeNull();
  });

  it('check-in de outro dia não conta como o de hoje', async () => {
    h.api.fetchCheckins.mockResolvedValue([{ checkin_date: '2026-10-06', energy: 5, sleep: 4, mood: 4 }]);
    render(<DailyCheckin />);
    expect(await screen.findByRole('dialog', { name: TITLE })).toBeTruthy();
  });

  it('falha ao buscar ainda abre o modal', async () => {
    h.api.fetchCheckins.mockRejectedValue(new Error('rede'));
    render(<DailyCheckin />);
    expect(await screen.findByRole('dialog', { name: TITLE })).toBeTruthy();
  });

  it('quem ainda não viu o tutorial de boas-vindas não leva o modal por cima; a linha continua lá', async () => {
    localStorage.clear();
    render(<DailyCheckin />);
    expect(await screen.findByRole('button', { name: 'Fazer check-in' })).toBeTruthy();
    expect(modal()).toBeNull();
  });

  it('com outro modal já aberto, não abre por cima', async () => {
    document.body.classList.add('modal-open');
    render(<DailyCheckin />);
    expect(await screen.findByRole('button', { name: 'Fazer check-in' })).toBeTruthy();
    expect(modal()).toBeNull();
  });
});
