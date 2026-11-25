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
// As pontas (1 e 5) levam o significado no nome: "Energia 5 de 5 (Cheio de energia)".
const option = (label, n) => screen.getByRole('radio', { name: new RegExp(`^${label} ${n} de 5`) });
const pick = (label, n) => fireEvent.click(option(label, n));
const modal = () => screen.queryByRole('dialog');
// O modal não abre sozinho: a pessoa toca em "Fazer check-in" na linha do Treino.
const openCheckin = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Fazer check-in' }));
  return screen.findByRole('dialog', { name: TITLE });
};

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

  it('sem check-in de hoje não abre o modal sozinho: só a linha, e o botão abre as três escalas', async () => {
    render(<DailyCheckin />);
    expect(await screen.findByRole('button', { name: 'Fazer check-in' })).toBeTruthy();
    expect(modal()).toBeNull();
    expect(await openCheckin()).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(true);
    expect(h.api.fetchCheckins).toHaveBeenCalledWith('u1', '2026-10-07');
  });

  it('cada escala diz o que valem as pontas, e o mesmo rosto não aparece com sentidos opostos', async () => {
    render(<DailyCheckin />);
    await openCheckin();
    for (const text of ['Sem energia', 'Cheio de energia', 'Dormi mal', 'Dormi muito bem', 'Para baixo', 'Ótimo']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(option('Sono', 5).getAttribute('aria-label')).toBe('Sono 5 de 5 (Dormi muito bem)');
    expect(option('Energia', 1).textContent).not.toBe(option('Sono', 5).textContent);
  });

  it('só habilita Registrar com energia, sono e humor escolhidos', async () => {
    render(<DailyCheckin />);
    await openCheckin();
    pick('Energia', 4);
    pick('Sono', 3);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(true);
    pick('Humor', 5);
    expect(screen.getByRole('button', { name: 'Registrar' }).disabled).toBe(false);
    expect(option('Energia', 4).getAttribute('aria-checked')).toBe('true');
  });

  it('registrar salva, avisa, fecha o modal e mostra a linha com a dica do dia', async () => {
    const onChange = vi.fn();
    render(<DailyCheckin onChange={onChange} />);
    await openCheckin();
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
    await openCheckin();
    pick('Energia', 3); pick('Sono', 3); pick('Humor', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível salvar o check-in'));
    expect(modal()).toBeTruthy();
    expect(option('Energia', 3).getAttribute('aria-checked')).toBe('true');
  });

  it('Agora não fecha sem salvar e não marca nada; ao voltar ao Treino o modal continua fechado', async () => {
    const first = render(<DailyCheckin />);
    await openCheckin();
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(modal()).toBeNull();
    expect(h.api.saveCheckin).not.toHaveBeenCalled();

    first.unmount();
    render(<DailyCheckin />);
    await screen.findByRole('button', { name: 'Fazer check-in' });
    expect(modal()).toBeNull();

    expect(await openCheckin()).toBeTruthy();
  });

  it('com check-in de hoje já respondido não abre; Refazer abre o modal com as respostas', async () => {
    h.api.fetchCheckins.mockResolvedValue([{ checkin_date: '2026-10-07', energy: 5, sleep: 4, mood: 4 }]);
    render(<DailyCheckin />);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(modal()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
    expect(screen.getByRole('dialog', { name: TITLE })).toBeTruthy();
    expect(option('Energia', 5).getAttribute('aria-checked')).toBe('true');
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

  it('check-in de outro dia não conta como o de hoje: a linha pede o de hoje', async () => {
    h.api.fetchCheckins.mockResolvedValue([{ checkin_date: '2026-10-06', energy: 5, sleep: 4, mood: 4 }]);
    render(<DailyCheckin />);
    expect(await screen.findByRole('button', { name: 'Fazer check-in' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('falha ao buscar ainda mostra a linha, e o botão abre o modal', async () => {
    h.api.fetchCheckins.mockRejectedValue(new Error('rede'));
    render(<DailyCheckin />);
    expect(await openCheckin()).toBeTruthy();
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
