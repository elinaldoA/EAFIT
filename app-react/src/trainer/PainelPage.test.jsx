// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));
vi.mock('../lib/trainer', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerCode: (...a) => h.api.fetchTrainerCode(...a),
}));
vi.mock('../lib/trainerRoster', async (importActual) => ({
  ...(await importActual()),
  fetchRoster: (...a) => h.api.fetchRoster(...a),
}));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  fetchUnreadReplies: (...a) => h.api.fetchUnreadReplies(...a),
}));
vi.mock('../lib/trainerAppointments', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerAppointments: (...a) => h.api.fetchTrainerAppointments(...a),
}));
vi.mock('../lib/trainerInvite', async (importActual) => ({
  ...(await importActual()),
  fetchInviteStats: (...a) => h.api.fetchInviteStats(...a),
}));

import PainelPage from './PainelPage';

const base = { paused: false, weeklyGoal: null, planName: 'P', planDays: 3, planEnd: null, planByMe: true, pain7: 0, tags: [], recent: [], since: '2026-09-01' };
const ROSTER = [
  { ...base, id: 'c1', name: 'Ana', last_day: '2026-10-07', days7: 3, days30: 12 },
  { ...base, id: 'c2', name: 'Bruno', last_day: '2026-10-06', days7: 1, days30: 6, planEnd: '2026-10-01' },
  { ...base, id: 'c3', name: 'Rafa', last_day: '2026-09-20', days7: 0, days30: 1, pain7: 2 },
];

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchRoster: vi.fn().mockResolvedValue(ROSTER),
    fetchTrainerCode: vi.fn().mockResolvedValue('P7K2QX'),
    fetchUnreadReplies: vi.fn().mockResolvedValue({}),
    fetchTrainerAppointments: vi.fn().mockResolvedValue([]),
    fetchInviteStats: vi.fn().mockResolvedValue({ visits: 10, signups: 3, clients: 2 }),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.share;
});

const setup = (props = {}) => {
  const fns = { onOpenClient: vi.fn(), onNavigate: vi.fn(), onQueueLoaded: vi.fn() };
  render(<PainelPage userName="Carla Dias" {...fns} {...props} />);
  return fns;
};

describe('PainelPage', () => {
  it('saúda pelo primeiro nome e mostra os números da carteira', async () => {
    setup();
    expect(screen.getByText('Olá, Carla')).toBeTruthy();
    await screen.findByText('alunos ativos');
    expect(screen.getByText('alunos ativos').previousSibling.textContent).toBe('3');
    expect(screen.getByText(/treinaram em 7 dias · 4 treinos/).previousSibling.textContent).toBe('2/3');
    // aderência: Ana 100%, Bruno 33%, Rafa 0% -> 44%
    expect(screen.getByText('aderência média à meta semanal').previousSibling.textContent).toBe('44%');
    expect(screen.getByText('planos vencendo ou vencidos').previousSibling.textContent).toBe('1');
  });

  it('fila "Precisam de você" do mais urgente ao menos, com os motivos', async () => {
    const { onOpenClient, onQueueLoaded } = setup();
    await screen.findByText('⚡ Precisam de você');
    const rows = [...document.querySelectorAll('.action-row strong')].map(e => e.textContent);
    expect(rows).toEqual(['Rafa', 'Bruno']);
    expect(screen.getByText('🩹 Relatou dor forte ou lesão')).toBeTruthy();
    expect(screen.getByText('📋 Plano vencido')).toBeTruthy();
    await waitFor(() => expect(onQueueLoaded).toHaveBeenCalledWith(2));
    fireEvent.click(screen.getByText('Rafa'));
    expect(onOpenClient).toHaveBeenCalledWith(expect.objectContaining({ id: 'c3' }));
  });

  it('resposta sem ler entra na fila', async () => {
    h.api.fetchUnreadReplies.mockResolvedValue({ c1: 2 });
    setup();
    expect(await screen.findByText('💬 2 resposta(s) sem ler')).toBeTruthy();
  });

  it('tudo em dia mostra a mensagem de parabéns', async () => {
    h.api.fetchRoster.mockResolvedValue([ROSTER[0]]);
    setup();
    expect(await screen.findByText(/Tudo em dia/)).toBeTruthy();
  });

  it('agenda: hoje e amanhã com a hora e a situação', async () => {
    const at = (days, hh) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hh, 0, 0, 0); return d.toISOString(); };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T08:00:00'));
    h.api.fetchTrainerAppointments.mockResolvedValue([
      { id: 'a1', name: 'Ana', starts: at(0, 18), status: 'confirmed', place: 'Academia X' },
      { id: 'a2', name: 'Bruno', starts: at(1, 7), status: 'pending' },
    ]);
    setup();
    expect(await screen.findByText('Hoje')).toBeTruthy();
    expect(screen.getByText('Amanhã')).toBeTruthy();
    expect(screen.getByText('Academia X')).toBeTruthy();
    expect(screen.getByText('1 hoje')).toBeTruthy();
    expect(screen.getByText('Confirmada')).toBeTruthy();
    expect(screen.getByText('Aguardando')).toBeTruthy();
    vi.useRealTimers();
  });

  it('atalhos levam às outras abas', async () => {
    const { onNavigate } = setup();
    await screen.findByText('alunos ativos');
    fireEvent.click(screen.getByRole('button', { name: /Modelos de treino/ }));
    expect(onNavigate).toHaveBeenLastCalledWith('modelos');
    fireEvent.click(screen.getByRole('button', { name: /Novo desafio/ }));
    expect(onNavigate).toHaveBeenLastCalledWith('turma', 'desafios');
    fireEvent.click(screen.getByText('alunos ativos'));
    expect(onNavigate).toHaveBeenLastCalledWith('alunos');
  });

  it('convite: código, link com os números e compartilhar', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    setup();
    expect(await screen.findByText('P7K2QX')).toBeTruthy();
    expect(screen.getByText('visitas pelo link (30 dias)').previousSibling.textContent).toBe('10');
    fireEvent.click(screen.getByRole('button', { name: '📤 Convidar aluno' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('P7K2QX') })));
  });

  it('falhas de carga não derrubam a tela', async () => {
    h.api.fetchRoster.mockRejectedValue(new Error('rede'));
    h.api.fetchTrainerAppointments.mockRejectedValue(new Error('x'));
    h.api.fetchInviteStats.mockRejectedValue(new Error('x'));
    setup();
    expect(await screen.findByText(/Nenhum aluno vinculado ainda/)).toBeTruthy();
  });
});
