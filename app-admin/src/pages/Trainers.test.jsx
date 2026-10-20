// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ rpc: vi.fn(), invites: vi.fn(), signups: vi.fn(), health: vi.fn(), clients: vi.fn(), results: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));
vi.mock('../lib/trainers', async orig => ({
  ...(await orig()),
  fetchTrainerActivity: () => Promise.resolve({}),
  fetchUpcomingAppointments: () => Promise.resolve([]),
  fetchTrainerInvites: (...a) => h.invites(...a),
  fetchTrainerInviteSignups: (...a) => h.signups(...a),
  fetchTrainerHealth: (...a) => h.health(...a),
  fetchTrainerClientsDetail: (...a) => h.clients(...a),
  fetchTrainerResults: (...a) => h.results(...a),
}));

import Trainers from './Trainers';
import { mapTrainerResult, rankTrainers } from '../lib/trainers';

beforeEach(() => {
  h.results.mockReset().mockResolvedValue({ p1: mapTrainerResult({ tr_clients: 3, tr_trained14: 2, tr_train_days: 18, tr_days: 30, tr_pr_clients: 1, tr_old: 2, tr_old_active: 1, tr_no_plan: 1, tr_appt_past: 4, tr_appt_attended: 3 }) });
  h.rpc.mockReset().mockResolvedValue({
    data: [{ tc_user: 'p1', tc_name: 'Paulo', tc_email: 'p@x', tc_code: 'PAULO1', tc_clients: 3, tc_since: '2026-10-01' }],
    error: null,
  });
  h.invites.mockReset().mockResolvedValue({ p1: { visits: 10, signups: 2, total: 5, linked: 1, active7: 3, lastSignup: null } });
  h.signups.mockReset().mockResolvedValue([
    { userId: 'u1', email: 'lia@x', name: 'Lia', createdAt: '2026-10-18', confirmed: true, lastSeen: '2026-10-20', workouts: 4, client: true },
  ]);
  h.health.mockReset().mockResolvedValue({ p1: { active: 3, added: 2, lost: 1, withGoal: 2, goalWeeks: 4, goalHit: 3, idle: 1, noContact: 1 } });
  h.clients.mockReset().mockResolvedValue([
    { userId: 'c1', name: 'Bia', since: '2026-10-15T10:00:00Z', days30: 3, lastDay: '2026-10-19', weeklyGoal: 3, goalWeeks: 0, goalHit: 0, lastContact: null },
    { userId: 'c2', name: 'Caio', since: '2025-01-01T10:00:00Z', days30: 0, lastDay: null, weeklyGoal: 4, goalWeeks: 4, goalHit: 1, lastContact: null },
  ]);
});
afterEach(cleanup);

const renderPage = () => render(<MemoryRouter><Trainers /></MemoryRouter>);

describe('Trainers (indicados pelo link)', () => {
  it('mostra os números do link e os totais', async () => {
    renderPage();
    expect(await screen.findByText(/10 visita\(s\) · 2 cadastro\(s\)/)).toBeTruthy();
    expect(screen.getByText('· 20%')).toBeTruthy();
    expect(screen.getByText('1 viraram aluno · 3 ativos 7d')).toBeTruthy();
    expect(screen.getByText('Indicados no total')).toBeTruthy();
    expect(h.invites).toHaveBeenCalledWith(30);
  });

  it('troca o período', async () => {
    renderPage();
    await screen.findByText(/10 visita/);
    fireEvent.click(screen.getByText('7 dias'));
    await waitFor(() => expect(h.invites).toHaveBeenCalledWith(7));
  });

  it('abre a lista de indicados com o link do personal', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Indicados (5)'));
    expect(await screen.findByText('lia@x')).toBeTruthy();
    expect(screen.getByText('https://eafit.com.br/app/?personal=PAULO1')).toBeTruthy();
    expect(h.signups).toHaveBeenCalledWith('p1');
  });
});

describe('Trainers (saúde da carteira)', () => {
  it('mostra os totais e a carteira de cada personal', async () => {
    renderPage();
    expect(await screen.findByText('+2 / −1')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('2 com meta')).toBeTruthy();
    expect(screen.getByText('1 parado(s)')).toBeTruthy();
    expect(screen.getByText('1 sem contato')).toBeTruthy();
    expect(h.health).toHaveBeenCalledWith(30);
  });

  it('lista os alunos com meta e alertas, quem precisa de atenção primeiro', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Ver alunos'));
    const caio = await screen.findByText('Caio');
    expect(screen.getByText('bateu 1 de 4 semana(s) · 25%')).toBeTruthy();
    expect(screen.getByText('parado')).toBeTruthy();
    expect(screen.getByText('sem contato')).toBeTruthy();
    expect(caio.compareDocumentPosition(screen.getByText('Bia')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h.clients).toHaveBeenCalledWith('p1');
  });
});

describe('ranking por resultado dos alunos', () => {
  it('calcula as taxas e ordena só quem tem 3+ alunos', () => {
    const r = mapTrainerResult({ tr_clients: 3, tr_trained14: 2, tr_train_days: 18, tr_days: 30, tr_pr_clients: 1, tr_old: 2, tr_old_active: 1, tr_no_plan: 1, tr_appt_past: 4, tr_appt_attended: 3 });
    expect(r).toMatchObject({ activePct: 67, daysPerWeek: 1.4, prPct: 33, retentionPct: 50, attendancePct: 75 });
    const list = rankTrainers([
      { id: 'a', clients: 5, activePct: 40, daysPerWeek: 2 },
      { id: 'b', clients: 4, activePct: 80, daysPerWeek: 1 },
      { id: 'c', clients: 1, activePct: 100, daysPerWeek: 4 },
    ]);
    expect(list.map(t => [t.id, t.position])).toEqual([['b', 1], ['a', 2], ['c', null]]);
  });

  it('aparece na página com o período escolhido', async () => {
    render(<MemoryRouter><Trainers /></MemoryRouter>);
    expect(await screen.findByText('Ranking por resultado dos alunos')).toBeTruthy();
    expect(await screen.findByText('75% de 4')).toBeTruthy();
    expect(h.results).toHaveBeenCalledWith(30);
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => expect(h.results).toHaveBeenCalledWith(90));
  });
});
