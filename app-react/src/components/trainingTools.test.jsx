// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1', user_metadata: {} },
  updateProfile: vi.fn(),
  toast: vi.fn(),
  fetchExerciseSetsWithDates: vi.fn(),
  fetchWeekSets: vi.fn(),
  fetchLibraryMap: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/tracking', () => ({ trackFeature: vi.fn() }));
vi.mock('../lib/sound', () => ({ playStepSound: vi.fn(), playWorkoutFinishedSound: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user, updateProfile: h.updateProfile }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('./ExerciseDemo', () => ({ default: () => null }));
vi.mock('../lib/records', async orig => ({
  ...(await orig()),
  fetchExerciseSetsWithDates: (...a) => h.fetchExerciseSetsWithDates(...a),
}));
vi.mock('../lib/muscleVolume', async orig => ({
  ...(await orig()),
  fetchWeekSets: (...a) => h.fetchWeekSets(...a),
  fetchLibraryMap: (...a) => h.fetchLibraryMap(...a),
}));

import { treinoData } from '../data/treinoData';
import QuickWorkoutModal from './QuickWorkoutModal';
import PlateCalc from './PlateCalc';
import MobilitySession from './MobilitySession';
import MuscleVolumeCard from './MuscleVolumeCard';
import StrengthGoals from './StrengthGoals';
import { MOBILITY_MOVES } from '../lib/mobility';

const segunda = treinoData.find(d => d.dia === 'Segunda');

beforeEach(() => {
  localStorage.clear();
  h.user = { id: 'u1', user_metadata: {} };
  h.updateProfile.mockReset().mockResolvedValue({ error: null });
  h.toast.mockReset();
  h.fetchExerciseSetsWithDates.mockReset().mockResolvedValue([]);
  h.fetchWeekSets.mockReset().mockResolvedValue([]);
  h.fetchLibraryMap.mockReset().mockResolvedValue(new Map());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('QuickWorkoutModal', () => {
  it('mostra a duração completa, as opções e o que muda', () => {
    const onChoose = vi.fn();
    render(<QuickWorkoutModal day={segunda} current={null} onChoose={onChoose} onClose={vi.fn()} />);
    expect(screen.getByText(/O treino completo de hoje leva cerca de/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '30 min' }));
    expect(screen.getByText('Sem o pós-treino (cardio e abdômen)')).toBeTruthy();
    fireEvent.click(screen.getByText('Usar versão de 30 min'));
    expect(onChoose).toHaveBeenCalledWith(30);
  });

  it('com versão curta ativa, oferece voltar ao completo', () => {
    const onChoose = vi.fn();
    render(<QuickWorkoutModal day={segunda} current={20} onChoose={onChoose} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Voltar ao treino completo'));
    expect(onChoose).toHaveBeenCalledWith(null);
  });
});

describe('PlateCalc', () => {
  const ex = { nome: 'Supino Reto com Barra', series: '3' };

  it('não aparece em exercício sem anilha', () => {
    const { container } = render(<PlateCalc ex={{ nome: 'Crucifixo Máquina', series: '3' }} setCount={3} />);
    expect(container.innerHTML).toBe('');
  });

  it('parte da carga da série em andamento e calcula por lado', () => {
    localStorage.setItem('set_Supino Reto com Barra_1_carga', '80');
    localStorage.setItem('set_Supino Reto com Barra_1_done', 'true');
    localStorage.setItem('set_Supino Reto com Barra_2_carga', '85');
    render(<PlateCalc ex={ex} setCount={3} />);
    fireEvent.click(screen.getByText(/Anilhas/));
    expect(screen.getByDisplayValue('85')).toBeTruthy();
    expect(screen.getByText('Cada lado: 25 + 5 + 2,5')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '15 kg' }));
    expect(screen.getByText('Cada lado: 25 + 10')).toBeTruthy();
    expect(localStorage.getItem('plate_bar_Supino Reto com Barra')).toBe('15');
  });
});

describe('MobilitySession', () => {
  it('apresenta a rotina, conta o tempo e avança', () => {
    vi.useFakeTimers();
    const moves = [MOBILITY_MOVES.find(m => m.nome === 'Gato-Vaca'), MOBILITY_MOVES.find(m => m.nome === 'Círculos de Ombro')];
    render(<MobilitySession moves={moves} phase="pre" title="Mobilidade" onClose={vi.fn()} />);
    expect(screen.getByText(/2 movimentos/)).toBeTruthy();
    fireEvent.click(screen.getByText('▶ Começar'));
    expect(screen.getByText('Prepare-se')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5500); });
    expect(screen.getByText('Agora')).toBeTruthy();
    fireEvent.click(screen.getByText('Pular ⏭'));
    act(() => { vi.advanceTimersByTime(5500); });
    // Círculos de Ombro é "cada lado": na metade avisa a troca.
    act(() => { vi.advanceTimersByTime(25000); });
    expect(screen.getByText('🔄 Troque de lado')).toBeTruthy();
    fireEvent.click(screen.getByText('Pular ⏭'));
    expect(screen.getByText('Mobilidade concluída!')).toBeTruthy();
    expect(localStorage.length).toBe(1);
  });
});

describe('MuscleVolumeCard', () => {
  it('conta as séries por músculo e aponta quem ficou para trás', async () => {
    h.fetchWeekSets.mockResolvedValue([
      ...Array(11).fill({ exercise_name: 'Supino Reto com Barra' }),
      { exercise_name: 'Remada Curvada com Barra' },
    ]);
    render(<MuscleVolumeCard userId="u1" planDays={treinoData} active />);
    await waitFor(() => expect(screen.getByText('11 séries')).toBeTruthy());
    expect(screen.getByText(/Ficando para trás:/)).toBeTruthy();
  });

  it('semana vazia', async () => {
    render(<MuscleVolumeCard userId="u1" planDays={treinoData} active />);
    await waitFor(() => expect(screen.getByText('Nenhuma série concluída nos últimos 7 dias.')).toBeTruthy());
  });
});

describe('StrengthGoals', () => {
  it('cria meta com o alvo sugerido', async () => {
    render(<StrengthGoals exercises={['Supino Reto com Barra']} allTimeLogs={[{ exercise_name: 'Supino Reto com Barra', carga: 80, reps: 6 }]} />);
    fireEvent.click(screen.getByText('+ Nova meta de carga'));
    fireEvent.change(screen.getByLabelText('Exercício'), { target: { value: 'Supino Reto com Barra' } });
    expect(screen.getByDisplayValue('107.5')).toBeTruthy();
    fireEvent.click(screen.getByText('Criar meta'));
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalled());
    const saved = h.updateProfile.mock.calls[0][0].strengthGoals;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ exercise: 'Supino Reto com Barra', target: 107.5 });
  });

  it('mostra a meta e marca como batida quando a carga chega lá', async () => {
    h.user = { id: 'u1', user_metadata: { strengthGoals: [{ id: 'g1', exercise: 'Supino Reto com Barra', target: 100, by: '2099-01-01', created: '2026-01-01' }] } };
    h.fetchExerciseSetsWithDates.mockResolvedValue([{ carga: 100, reps: 1, workout_date: '2026-10-20' }]);
    render(<StrengthGoals exercises={['Supino Reto com Barra']} allTimeLogs={[]} />);
    await waitFor(() => expect(screen.getByText(/Meta batida!/)).toBeTruthy());
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalled());
    expect(h.updateProfile.mock.calls[0][0].strengthGoals[0].achieved).toBeTruthy();
  });
});
