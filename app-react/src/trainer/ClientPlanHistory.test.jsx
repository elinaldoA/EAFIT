// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchPlans: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/trainerRoster', async (importActual) => ({
  ...(await importActual()),
  fetchClientPlans: (...a) => h.fetchPlans(...a),
}));

import ClientPlanHistory from './ClientPlanHistory';

const PLANS = [
  { id: 'p1', name: 'Hipertrofia A/B', at: '2026-10-01T12:00:00Z', start: '2026-10-01', end: '2026-11-26', weeks: 8, active: true, byMe: true, days: 4 },
  { id: 'p2', name: 'Adaptação', at: '2026-08-01T12:00:00Z', start: '2026-08-01', end: '2026-08-29', weeks: 4, active: false, byMe: false, days: 3 },
  { id: 'p3', name: 'Sem prazo', at: '2026-07-10T12:00:00Z', start: null, end: null, weeks: null, active: false, byMe: true, days: 1 },
];

beforeEach(() => {
  h.fetchPlans = vi.fn().mockResolvedValue(PLANS);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClientPlanHistory', () => {
  it('lista os planos com nome, dias, quem montou e o período', async () => {
    render(<ClientPlanHistory clientId="c1" />);
    expect(await screen.findByText('Hipertrofia A/B')).toBeTruthy();
    expect(h.fetchPlans).toHaveBeenCalledWith('c1');
    expect(screen.getByText(/4 dia\(s\) · por você · 01\/10 → 26\/11/)).toBeTruthy();
    expect(screen.getByText(/3 dia\(s\) · pelo aluno ou pelo app · 01\/08 → 29\/08/)).toBeTruthy();
  });

  it('plano sem datas mostra quando foi criado', async () => {
    render(<ClientPlanHistory clientId="c1" />);
    expect(await screen.findByText(/1 dia\(s\) · por você · criado em 10\/07/)).toBeTruthy();
  });

  it('plano com início e sem fim mostra só o início', async () => {
    h.fetchPlans.mockResolvedValue([{ ...PLANS[0], end: null }]);
    render(<ClientPlanHistory clientId="c1" />);
    const line = await screen.findByText(/4 dia\(s\) · por você · 01\/10/);
    expect(line.textContent).not.toContain('→');
  });

  it('só o plano ativo leva o selo "Ativo"', async () => {
    render(<ClientPlanHistory clientId="c1" />);
    await screen.findByText('Hipertrofia A/B');
    expect(screen.getAllByText('Ativo')).toHaveLength(1);
    const active = document.querySelector('.plan-history__item--active');
    expect(active.textContent).toContain('Hipertrofia A/B');
    expect(document.querySelectorAll('.plan-history__item')).toHaveLength(3);
  });

  it('sem planos não mostra o cartão', async () => {
    h.fetchPlans.mockResolvedValue([]);
    const { container } = render(<ClientPlanHistory clientId="c1" />);
    await waitFor(() => expect(h.fetchPlans).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('erro ao carregar (migration pendente) some em silêncio', async () => {
    h.fetchPlans.mockRejectedValue(new Error('PGRST202'));
    const { container } = render(<ClientPlanHistory clientId="c1" />);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('recarrega quando a versão muda (depois de enviar um treino novo)', async () => {
    const { rerender } = render(<ClientPlanHistory clientId="c1" version={0} />);
    await screen.findByText('Hipertrofia A/B');
    expect(h.fetchPlans).toHaveBeenCalledTimes(1);
    rerender(<ClientPlanHistory clientId="c1" version={1} />);
    await waitFor(() => expect(h.fetchPlans).toHaveBeenCalledTimes(2));
  });

  it('troca de aluno busca os planos do novo aluno', async () => {
    const { rerender } = render(<ClientPlanHistory clientId="c1" />);
    await screen.findByText('Hipertrofia A/B');
    rerender(<ClientPlanHistory clientId="c2" />);
    await waitFor(() => expect(h.fetchPlans).toHaveBeenLastCalledWith('c2'));
  });
});
