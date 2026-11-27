// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/arena', async importActual => ({
  ...(await importActual()),
  fetchArena: (...a) => h.api.fetchArena(...a),
  claimMission: (...a) => h.api.claimMission(...a),
}));

import ArenaCard from './ArenaCard';

const ARENA = {
  enabled: true, run_released: true, xp: 120, level: 2, level_from: 50, level_to: 200, streak: 3, best_streak: 5, today_xp: 70, daily_cap: 300,
  missions: [
    { id: 'dia_ativo', title: 'Mexa-se hoje', period: 'daily', module: 'any', xp: 15, done: true, claimed: false,
      progress: [{ metric: 'active_days', have: 1, target: 1 }] },
    { id: 'semana_3_treinos', title: 'Três treinos na semana', period: 'weekly', module: 'gym', xp: 100, done: false, claimed: false,
      progress: [{ metric: 'workouts', have: 1, target: 3 }] },
    { id: 'semana_5_km', title: '5 km na semana', period: 'weekly', module: 'run', xp: 100, done: false, claimed: true,
      progress: [{ metric: 'run_km', have: 5, target: 5 }] },
  ],
};

beforeEach(() => {
  h.toast.mockReset();
  h.api = { fetchArena: vi.fn(), claimMission: vi.fn().mockResolvedValue({ xp: 15 }) };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ArenaCard', () => {
  it('some com a Arena desligada ou com erro', async () => {
    h.api.fetchArena.mockResolvedValue({ enabled: false });
    const { container } = render(<ArenaCard sport="gym" />);
    await waitFor(() => expect(h.api.fetchArena).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
    cleanup();
    h.api.fetchArena.mockRejectedValue(new Error('rpc'));
    const second = render(<ArenaCard sport="gym" />);
    await waitFor(() => expect(h.api.fetchArena).toHaveBeenCalledTimes(2));
    expect(second.container.innerHTML).toBe('');
  });

  it('mostra nível, sequência e só as missões do módulo', async () => {
    h.api.fetchArena.mockResolvedValue(ARENA);
    render(<ArenaCard sport="gym" />);
    expect(await screen.findByText('Nível 2')).toBeTruthy();
    expect(screen.getByText('120 XP · faltam 80 para o nível 3')).toBeTruthy();
    expect(screen.getByText(/Sequência de 3 dias/)).toBeTruthy();
    expect(screen.getByText('Hoje: 70/300 XP')).toBeTruthy();
    expect(screen.getByText('Mexa-se hoje')).toBeTruthy();
    expect(screen.getByText('Três treinos na semana')).toBeTruthy();
    expect(screen.queryByText('5 km na semana')).toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('47');
  });

  it('resgata só a missão batida e avisa o XP', async () => {
    h.api.fetchArena.mockResolvedValueOnce(ARENA).mockResolvedValue({ ...ARENA, xp: 135 });
    render(<ArenaCard sport="gym" />);
    await screen.findByText('Mexa-se hoje');
    const buttons = screen.getAllByText('Resgatar');
    expect(buttons[1].disabled).toBe(true);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(h.api.claimMission).toHaveBeenCalledWith('dia_ativo'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⭐ +15 XP!'));
  });

  it('avisa quando sobe de nível', async () => {
    h.api.fetchArena.mockResolvedValueOnce(ARENA).mockResolvedValue({ ...ARENA, level: 3, xp: 205 });
    render(<ArenaCard sport="gym" />);
    fireEvent.click((await screen.findAllByText('Resgatar'))[0]);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🎉 Você chegou ao nível 3!', 6000));
  });

  it('mostra o erro quando o resgate falha', async () => {
    h.api.fetchArena.mockResolvedValue(ARENA);
    h.api.claimMission.mockRejectedValue(new Error('mission_not_done'));
    render(<ArenaCard sport="gym" />);
    fireEvent.click((await screen.findAllByText('Resgatar'))[0]);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Não foi possível resgatar agora. Tente de novo.'));
  });

  it('esconde a Arena no Run enquanto o módulo não foi liberado, mas mantém no Gym', async () => {
    h.api.fetchArena.mockResolvedValue({ ...ARENA, run_released: false });
    const run = render(<ArenaCard sport="run" />);
    await waitFor(() => expect(h.api.fetchArena).toHaveBeenCalledTimes(1));
    expect(run.container.innerHTML).toBe('');
    cleanup();
    render(<ArenaCard sport="gym" />);
    expect(await screen.findByText('Nível 2')).toBeTruthy();
  });

  it('mostra as missões de corrida no Run, com a resgatada marcada', async () => {
    h.api.fetchArena.mockResolvedValue(ARENA);
    render(<ArenaCard sport="run" />);
    expect(await screen.findByText('5 km na semana')).toBeTruthy();
    expect(screen.getByText('✅ Resgatada')).toBeTruthy();
    expect(screen.queryByText('Três treinos na semana')).toBeNull();
  });
});
