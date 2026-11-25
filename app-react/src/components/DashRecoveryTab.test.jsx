// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ sets: vi.fn(), plan: [] }));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ activePlanDays: h.plan }) }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-14', todayName: () => 'Quarta' }));
vi.mock('../lib/trainingCoach', async orig => ({ ...(await orig()), fetchRecentSets: (...a) => h.sets(...a) }));
vi.mock('../lib/muscleVolume', async orig => ({ ...(await orig()), fetchLibraryMap: () => Promise.resolve(new Map()) }));
// O corpo desenhado traz uma imagem grande e não é o que está em teste.
vi.mock('./BodyAvatar', () => ({ default: ({ levels, legend }) => <div data-testid="avatar" data-legend={legend} data-chest={levels.chest} /> }));

import DashRecoveryTab from './DashRecoveryTab';

const rows = (n, nome, workout_date) => Array.from({ length: n }, () => ({ exercise_name: nome, workout_date }));

beforeEach(() => {
  h.plan = [];
  h.sets.mockReset().mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DashRecoveryTab', () => {
  it('não busca nada enquanto a aba não está ativa', () => {
    render(<DashRecoveryTab active={false} />);
    expect(h.sets).not.toHaveBeenCalled();
  });

  it('sem treino nas últimas semanas, diz o que fazer', async () => {
    render(<DashRecoveryTab active />);
    expect(await screen.findByText(/Nenhum treino nas últimas 8 semanas/)).toBeTruthy();
    expect(screen.queryByTestId('avatar')).toBeNull();
  });

  it('separa os músculos em descansando, quase prontos e recuperados, com o que falta escrito', async () => {
    h.sets.mockResolvedValue([
      ...rows(4, 'Supino Reto com Barra', '2026-10-14'), // peito, hoje: descansando
      ...rows(5, 'Remada Curvada com Barra', '2026-10-13'), // costas, ontem: quase pronto
      ...rows(3, 'Rosca Direta', '2026-10-13'), // bíceps, ontem: recuperado
    ]);
    render(<DashRecoveryTab active />);
    const tired = await screen.findByRole('region', { name: 'Descansando' });
    expect(within(tired).getByText('Peitoral')).toBeTruthy();
    expect(within(tired).getByText('Pronto em 2 dias')).toBeTruthy();
    expect(within(tired).getByText('Treinado hoje · 4 séries')).toBeTruthy();

    const almost = screen.getByRole('region', { name: 'Quase prontos' });
    expect(within(almost).getByText('Costas')).toBeTruthy();
    expect(within(almost).getByText('Pronto em 1 dia')).toBeTruthy();
    expect(within(almost).getByText('Treinado ontem · 5 séries')).toBeTruthy();

    const ready = screen.getByRole('region', { name: 'Recuperados' });
    expect(within(ready).getByText('Bíceps')).toBeTruthy();
    expect(within(ready).getByText('Pronto')).toBeTruthy();

    // O corpo recebe o estado de cada músculo e a legenda de recuperação.
    expect(screen.getByTestId('avatar').dataset).toMatchObject({ chest: 'tired', legend: 'recovery' });
    // Quem não treinou no período fica numa linha só, sem virar ruído.
    expect(screen.getByText(/Sem treino nas últimas 8 semanas: .*Quadríceps/)).toBeTruthy();
  });

  it('avisa quando o treino de hoje trabalha um músculo que ainda está descansando', async () => {
    h.plan = [{ dia: 'Quarta', foco: 'Peito', exercicios: [{ nome: 'Supino Reto com Barra', series: '3' }], pos: [] }];
    h.sets.mockResolvedValue(rows(4, 'Supino Reto com Barra', '2026-10-14'));
    render(<DashRecoveryTab active />);
    expect((await screen.findByRole('status')).textContent).toMatch(/Seu treino de hoje trabalha Peitoral, que ainda está descansando/);
  });

  it('não avisa quando o músculo de hoje já está recuperado', async () => {
    h.plan = [{ dia: 'Quarta', foco: 'Peito', exercicios: [{ nome: 'Supino Reto com Barra', series: '3' }], pos: [] }];
    h.sets.mockResolvedValue(rows(4, 'Supino Reto com Barra', '2026-10-10'));
    render(<DashRecoveryTab active />);
    await screen.findByRole('region', { name: 'Recuperados' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('erro ao buscar mostra o aviso', async () => {
    h.sets.mockRejectedValue(new Error('rede'));
    render(<DashRecoveryTab active />);
    await waitFor(() => expect(screen.getByText('⚠️ Não deu para carregar a recuperação agora.')).toBeTruthy());
  });
});
