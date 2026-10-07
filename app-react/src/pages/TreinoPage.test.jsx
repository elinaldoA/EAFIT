// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { workout, mockToast, deleteChain } = vi.hoisted(() => ({
  workout: {},
  mockToast: vi.fn(),
  deleteChain: { result: { error: null }, in: vi.fn(), eq: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({
  db: { from: () => ({ delete: () => deleteChain }) },
}));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => workout }));
vi.mock('../context/useToast', () => ({ useToast: () => mockToast }));
// Dia fixo: o teste não pode depender do dia da semana em que roda.
vi.mock('../data/treinoData', async (importOriginal) => ({ ...(await importOriginal()), todayName: () => 'Segunda' }));

// Filhos pesados viram stubs: aqui só importa o que a página decide mostrar.
vi.mock('../components/PauseBanner', () => ({ default: () => null }));
vi.mock('../components/PersonalMessages', () => ({ default: () => null }));
vi.mock('../components/MyAppointments', () => ({ default: () => null }));
vi.mock('../components/DailyCheckin', () => ({ default: () => null }));
vi.mock('../components/RestTimer', () => ({ default: () => null }));
vi.mock('../components/WorkoutDayCard', () => ({ default: ({ day }) => <div data-testid="day-card">{day.dia}</div> }));
vi.mock('../components/PlanEditorModal', () => ({ default: () => <div role="dialog">editor de plano</div> }));
vi.mock('../components/WorkoutSummaryModal', () => ({ default: () => null }));

import TreinoPage from './TreinoPage';

const SEGUNDA = { dia: 'Segunda', foco: 'Peito', exercicios: [{ nome: 'Supino', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [] };
const TERCA = { dia: 'Terça', foco: 'Costas', exercicios: [{ nome: 'Remada', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [] };

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  deleteChain.result = { error: null };
  deleteChain.eq = vi.fn(() => deleteChain);
  deleteChain.in = vi.fn(() => Promise.resolve(deleteChain.result));
  Object.assign(workout, {
    dataVersion: 1, syncStatus: 'ok', syncNow: vi.fn().mockResolvedValue(undefined),
    activePlanDays: [SEGUNDA, TERCA], planExpired: false, planByTrainer: false,
    planStartDate: null, planEndDate: null, saveWorkoutRating: vi.fn(),
  });
});

describe('TreinoPage', () => {
  it('mostra o treino de hoje e um card por dia do plano', () => {
    render(<TreinoPage />);
    expect(screen.getByText('Treino de hoje')).toBeTruthy();
    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getAllByTestId('day-card')).toHaveLength(2);
    expect(screen.getByText('0/2 treinos')).toBeTruthy();
  });

  it('o botão do dia acompanha o progresso: começar, continuar e revisar', () => {
    const { unmount } = render(<TreinoPage />);
    expect(screen.getByText('⚡ Começar treino')).toBeTruthy();
    unmount();

    localStorage.setItem('set_Supino_1_done', 'true');
    const second = render(<TreinoPage />);
    expect(screen.getByText('⚡ Continuar treino')).toBeTruthy();
    second.unmount();

    localStorage.setItem('treino_Segunda', 'true');
    render(<TreinoPage />);
    expect(screen.getByText('💪 Revisar treino')).toBeTruthy();
    expect(screen.getByText('1/2 treinos')).toBeTruthy();
  });

  it('enquanto sincroniza esconde o card de hoje e trava o "Limpar"', () => {
    workout.syncStatus = 'loading';
    render(<TreinoPage />);
    expect(screen.queryByText('Treino de hoje')).toBeNull();
    expect(screen.getByText('Limpar').disabled).toBe(true);
  });

  it('plano vencido sem sucessor avisa e oferece escolher outro', () => {
    workout.planExpired = true;
    render(<TreinoPage />);
    fireEvent.click(screen.getByText('Escolher plano'));
    expect(screen.getByRole('dialog').textContent).toBe('editor de plano');
  });

  it('plano do personal mostra a nota de autoria', () => {
    workout.planByTrainer = true;
    render(<TreinoPage />);
    expect(screen.getByText('📋 Plano montado pelo seu personal')).toBeTruthy();
  });

  describe('Limpar', () => {
    beforeEach(() => {
      localStorage.setItem('treino_Segunda', 'true');
      localStorage.setItem('set_Supino_1_done', 'true');
      localStorage.setItem('theme', 'dark');
    });

    it('cancelando a confirmação não apaga nada', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      render(<TreinoPage />);
      fireEvent.click(screen.getByText('Limpar'));
      expect(localStorage.getItem('treino_Segunda')).toBe('true');
      expect(deleteChain.in).not.toHaveBeenCalled();
    });

    it('confirmando apaga o cache, remove os treinos da semana no servidor e ressincroniza', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<TreinoPage />);
      fireEvent.click(screen.getByText('Limpar'));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('🧹 Checks e cargas limpos'));
      expect(localStorage.getItem('treino_Segunda')).toBeNull();
      expect(localStorage.getItem('set_Supino_1_done')).toBeNull();
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(deleteChain.eq).toHaveBeenCalledWith('user_id', 'u1');
      expect(deleteChain.in.mock.calls[0][1]).toHaveLength(2);
      expect(workout.syncNow).toHaveBeenCalled();
    });

    it('falha no servidor: limpa só o local e avisa', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      deleteChain.result = { error: new Error('rede') };
      render(<TreinoPage />);
      fireEvent.click(screen.getByText('Limpar'));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('falhou ao sincronizar')));
      expect(workout.syncNow).not.toHaveBeenCalled();
    });
  });
});
