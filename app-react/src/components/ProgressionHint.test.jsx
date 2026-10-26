// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1' },
  refreshPlan: vi.fn(),
  toast: vi.fn(),
  fetchSets: vi.fn(),
  substitute: vi.fn(),
  swapLog: vi.fn(),
  libraryRow: { nome: 'Flexão Declinada (Pés no Banco)', reps: '8-10', descanso: '90s', tecnica: 'Foco peito superior, core firme' },
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ refreshPlan: h.refreshPlan }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/supabase', () => ({
  db: { from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: h.libraryRow, error: null }) }) }) }) },
}));
vi.mock('../lib/workoutPlans', () => ({ substituteExercise: (...a) => h.substitute(...a) }));
vi.mock('../lib/tracking', () => ({ logExerciseSwap: (...a) => h.swapLog(...a) }));
vi.mock('../lib/bodyweight', async importOriginal => ({
  ...(await importOriginal()),
  fetchBodyweightSets: (...a) => h.fetchSets(...a),
}));

import ProgressionHint from './ProgressionHint';

const EX = { id: 'pe-1', nome: 'Flexão de Braço', series: '3', reps: '8-10', descanso: '90s' };
const set = (date, reps) => ({ date, carga: null, reps, duracaoS: null });
const READY = [10, 10, 10].map(r => set('2026-10-08', r)).concat([10, 10, 10].map(r => set('2026-10-01', r)));

beforeEach(() => {
  h.refreshPlan.mockReset().mockResolvedValue(undefined);
  h.toast.mockReset();
  h.substitute.mockReset().mockResolvedValue(undefined);
  h.swapLog.mockReset();
  h.fetchSets.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe('ProgressionHint', () => {
  it('mostra o nível do exercício na cadeia', async () => {
    render(<ProgressionHint ex={EX} setCount={3} open />);
    expect(await screen.findByText('Empurrar · nível 4 de 7')).toBeTruthy();
  });

  it('não mostra nada para exercício fora das cadeias e que não é por tempo', () => {
    const { container } = render(<ProgressionHint ex={{ nome: 'Supino Reto com Barra', series: '4', reps: '8-10' }} setCount={4} open />);
    expect(container.innerHTML).toBe('');
    expect(h.fetchSets).not.toHaveBeenCalled();
  });

  it('não consulta o histórico com o bloco fechado', () => {
    render(<ProgressionHint ex={EX} setCount={3} open={false} />);
    expect(h.fetchSets).not.toHaveBeenCalled();
  });

  it('sugere uma repetição a mais quando ainda não bateu o teto', async () => {
    h.fetchSets.mockResolvedValue([set('2026-10-08', 7), set('2026-10-08', 8)]);
    render(<ProgressionHint ex={EX} setCount={3} open />);
    expect(await screen.findByText('💡 Última vez: 8 reps — tente 9 reps')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '⬆ Subir de nível' })).toBeNull();
  });

  it('pronto: oferece subir e troca o exercício do plano pelo próximo degrau', async () => {
    h.fetchSets.mockResolvedValue(READY);
    render(<ProgressionHint ex={EX} setCount={3} open />);
    fireEvent.click(await screen.findByRole('button', { name: '⬆ Subir de nível' }));
    await waitFor(() => expect(h.refreshPlan).toHaveBeenCalled());
    expect(h.substitute).toHaveBeenCalledWith('pe-1', {
      nome: 'Flexão Declinada (Pés no Banco)', series: '3', reps: '8-10', descanso: '90s', tecnica: 'Foco peito superior, core firme',
    });
    expect(h.swapLog).toHaveBeenCalledWith('Flexão de Braço', 'Flexão Declinada (Pés no Banco)', 'progressao');
  });

  it('plano sem id (não editável) não oferece o botão de subir', async () => {
    h.fetchSets.mockResolvedValue(READY);
    render(<ProgressionHint ex={{ ...EX, id: undefined }} setCount={3} open />);
    expect(await screen.findByText(/Próximo nível/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '⬆ Subir de nível' })).toBeNull();
  });
});
