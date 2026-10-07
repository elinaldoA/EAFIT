// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, renderHook, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  media: { value: null },
  custom: { value: null },
  goals: { fetchMyGoals: vi.fn() },
  auth: { refreshSession: vi.fn() },
  store: { snapshot: {}, loadCustomMedia: vi.fn(), listeners: new Set() },
}));

vi.mock('../lib/supabase', () => ({ db: { auth: h.auth } }));
vi.mock('../lib/trainerInsights', () => h.goals);
vi.mock('../data/treinoData', async orig => ({ ...(await orig()), todayDate: () => '2026-10-07' }));
vi.mock('../data/exerciseMedia', async orig => ({
  ...(await orig()),
  getExerciseMedia: (...a) => { h.media.args = a; return h.media.value; },
}));
vi.mock('../hooks/useCustomExerciseMedia', () => ({ useCustomExerciseMedia: () => h.custom.value }));

import { Heatmap, WeeklyBars, PRList, WeekCompare, LoadHistory } from './DashCharts';
import Tutorial from './Tutorial';
import ExerciseDemo from './ExerciseDemo';
import { useTrainerGoalsSync } from '../hooks/useTrainerGoalsSync';
import { STUDENT_STEPS, TRAINER_STEPS, TUTORIAL_EVENT, startTutorial, hasSeenTutorial } from '../lib/tutorial';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.media.value = null;
  h.custom.value = null;
  h.goals.fetchMyGoals.mockResolvedValue(null);
  h.auth.refreshSession.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.classList.remove('modal-open');
});

describe('Heatmap', () => {
  it('desenha 35 células, a última sendo futura/hoje, e classifica os dias', () => {
    const workouts = [
      { workout_date: '2026-10-05', completed: true },
      { workout_date: '2026-10-06', completed: false },
    ];
    const { container } = render(<Heatmap workouts={workouts} />);
    const cells = [...container.querySelectorAll('.heatmap-cell')];
    expect(cells).toHaveLength(35);
    const byDate = Object.fromEntries(cells.map(c => [c.title, c.className]));
    expect(byDate['2026-10-05']).toContain('--done');
    expect(byDate['2026-10-06']).toContain('--miss');
    expect(byDate['2026-10-07']).toContain('--none');
    expect(byDate['2026-10-08']).toContain('--future');
    expect(byDate['2026-10-03']).toContain('--rest');
    expect(cells[0].title).toBe('2026-09-07');
  });
});

describe('WeeklyBars', () => {
  it('agrupa treinos concluídos por semana e rotula as duas últimas', () => {
    const workouts = [
      { workout_date: '2026-10-05', completed: true },
      { workout_date: '2026-10-06', completed: true },
      { workout_date: '2026-10-01', completed: true },
      { workout_date: '2026-10-02', completed: false },
    ];
    const { container } = render(<WeeklyBars workouts={workouts} weeklyGoal={4} />);
    const cols = container.querySelectorAll('.bar-col');
    expect(cols).toHaveLength(8);
    const last = cols[7];
    expect(last.querySelector('.bar-col__label').textContent).toBe('Esta');
    expect(last.querySelector('.bar-col__val').textContent).toBe('2');
    expect(last.querySelector('.bar-col__fill').style.height).toBe('50%');
    expect(cols[6].querySelector('.bar-col__label').textContent).toBe('Ant.');
    expect(cols[6].querySelector('.bar-col__val').textContent).toBe('1');
    expect(cols[0].querySelector('.bar-col__label').textContent).toBe('17/08');
  });
});

describe('PRList', () => {
  it('estado vazio', () => {
    render(<PRList logs={[]} />);
    expect(screen.getByText(/Nenhuma carga registrada ainda/)).toBeTruthy();
  });

  it('só cargas não numéricas mostram a mensagem específica', () => {
    render(<PRList logs={[{ exercise_name: 'Prancha', carga: 'corpo', reps: 1, workout_date: '2026-10-01' }]} />);
    expect(screen.getByText('Nenhuma carga numérica registrada ainda.')).toBeTruthy();
  });

  it('mostra o recorde por exercício, 1RM e ordena por carga', () => {
    const logs = [
      { exercise_name: 'Supino', carga: '60', reps: 10, workout_date: '2026-09-20' },
      { exercise_name: 'Supino', carga: '80', reps: 5, workout_date: '2026-10-01' },
      { exercise_name: 'Agachamento', carga: '100', reps: 5, workout_date: '2026-10-02' },
    ];
    const { container } = render(<PRList logs={logs} />);
    const rows = [...container.querySelectorAll('.pr-row')];
    expect(rows.map(r => r.querySelector('.pr-row__name').textContent)).toEqual(['Agachamento', 'Supino']);
    expect(rows[1].querySelector('.pr-row__val').textContent).toBe('80kg');
    expect(rows[1].querySelector('.pr-row__meta').textContent).toMatch(/1RM ~93kg · 01\/10/);
    expect(rows[0].querySelector('.pr-row__bar div').style.width).toBe('100%');
    expect(rows[1].querySelector('.pr-row__bar div').style.width).toBe('80%');
  });

  it('limita a 12 exercícios', () => {
    const logs = Array.from({ length: 15 }, (_, i) => ({ exercise_name: `Ex ${i}`, carga: String(10 + i), reps: 5, workout_date: '2026-10-01' }));
    const { container } = render(<PRList logs={logs} />);
    expect(container.querySelectorAll('.pr-row')).toHaveLength(12);
  });
});

describe('WeekCompare', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 12));
  });

  const log = (date, carga) => ({ exercise_name: 'Supino', carga: String(carga), workout_date: date });

  it('não renderiza sem registros do exercício', () => {
    const { container } = render(<WeekCompare logs={[log('2026-08-01', 50)]} exercise="Supino" />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra aumento em relação à semana passada', () => {
    render(<WeekCompare logs={[log('2026-10-06', 62.5), log('2026-09-30', 60)]} exercise="Supino" />);
    expect(screen.getByText('60kg')).toBeTruthy();
    expect(screen.getByText('62.5kg')).toBeTruthy();
    expect(screen.getByText('📈 +2.5kg em relação à semana passada')).toBeTruthy();
  });

  it('mostra queda e mesma carga', () => {
    const { unmount } = render(<WeekCompare logs={[log('2026-10-06', 55), log('2026-09-30', 60)]} exercise="Supino" />);
    expect(screen.getByText('📉 -5.0kg em relação à semana passada')).toBeTruthy();
    unmount();
    render(<WeekCompare logs={[log('2026-10-06', 60), log('2026-09-30', 60)]} exercise="Supino" />);
    expect(screen.getByText('➡️ Mesma carga da semana passada')).toBeTruthy();
  });

  it('só uma das semanas: mostra travessão e sem comparação', () => {
    render(<WeekCompare logs={[log('2026-10-06', 60)]} exercise="Supino" />);
    expect(screen.getByText('–')).toBeTruthy();
    expect(document.querySelector('.week-compare__diff')).toBeNull();
  });
});

describe('LoadHistory', () => {
  it('vazio não renderiza; com pontos mostra do mais recente ao mais antigo', () => {
    const { container, rerender } = render(<LoadHistory points={[]} />);
    expect(container.firstChild).toBeNull();
    rerender(<LoadHistory points={[{ label: '01/10', value: 50 }, { label: '05/10', value: 55 }]} />);
    const dates = [...container.querySelectorAll('.load-history__date')].map(e => e.textContent);
    expect(dates).toEqual(['05/10', '01/10']);
    expect(screen.getByText('55kg')).toBeTruthy();
  });
});

describe('Tutorial', () => {
  beforeEach(() => vi.useFakeTimers());

  const open = async (props = {}) => {
    const onNavigate = vi.fn();
    const utils = render(<Tutorial role="student" userId="u1" onNavigate={onNavigate} {...props} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    return { onNavigate, ...utils };
  };

  it('abre sozinho na primeira vez, depois de 700ms', async () => {
    render(<Tutorial role="student" userId="u1" onNavigate={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(screen.getByRole('dialog', { name: 'Tutorial do app' })).toBeTruthy();
    expect(screen.getByText(STUDENT_STEPS[0].title)).toBeTruthy();
    expect(document.body.classList.contains('modal-open')).toBe(true);
  });

  it('não abre se já viu nem sem usuário', async () => {
    localStorage.setItem('eafit_tutorial_done:student:u1', '1');
    await open();
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    await open({ userId: null });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('navega: próximo, voltar e navega para a aba do passo', async () => {
    const { onNavigate } = await open();
    expect(screen.queryByText('Voltar')).toBeNull();
    fireEvent.click(screen.getByText('Próximo'));
    expect(screen.getByText(STUDENT_STEPS[1].title)).toBeTruthy();
    expect(onNavigate).toHaveBeenCalledWith('treino');
    fireEvent.click(screen.getByText('Voltar'));
    expect(screen.getByText(STUDENT_STEPS[0].title)).toBeTruthy();
  });

  it('pular fecha e marca como visto', async () => {
    await open();
    fireEvent.click(screen.getByText('Pular'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hasSeenTutorial('student', 'u1')).toBe(true);
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('Esc fecha o tutorial', async () => {
    await open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hasSeenTutorial('student', 'u1')).toBe(true);
  });

  it('último passo mostra Concluir (sem Pular) e fecha', async () => {
    await open();
    for (let i = 0; i < STUDENT_STEPS.length - 1; i++) fireEvent.click(screen.getByText('Próximo'));
    expect(screen.queryByText('Pular')).toBeNull();
    fireEvent.click(screen.getByText('Concluir'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o papel de personal usa os passos do personal', async () => {
    await open({ role: 'trainer' });
    expect(screen.getByText(TRAINER_STEPS[0].title)).toBeTruthy();
  });

  it('destaca o elemento do passo quando ele existe', async () => {
    const target = document.createElement('div');
    target.className = 'progress-card';
    target.getBoundingClientRect = () => ({ top: 100, left: 20, width: 200, height: 50 });
    target.scrollIntoView = vi.fn();
    const page = document.createElement('div');
    page.id = 'page-treino';
    page.appendChild(target);
    document.body.appendChild(page);
    await open();
    fireEvent.click(screen.getByText('Próximo'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const spot = document.querySelector('.tutorial__spot');
    expect(spot).toBeTruthy();
    expect(spot.style.top).toBe('94px');
    expect(spot.style.width).toBe('212px');
    expect(target.scrollIntoView).toHaveBeenCalled();
    page.remove();
  });

  it('sem o elemento, tenta algumas vezes e mantém o fundo escurecido', async () => {
    await open();
    fireEvent.click(screen.getByText('Próximo'));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(document.querySelector('.tutorial__spot')).toBeNull();
    expect(document.querySelector('.tutorial__dim')).toBeTruthy();
  });

  it('reabre pelo evento startTutorial mesmo já visto', async () => {
    localStorage.setItem('eafit_tutorial_done:student:u1', '1');
    await open();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => { startTutorial(); });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('lib/tutorial', () => {
  it('todos os passos têm título e texto; abas e alvos são consistentes', () => {
    for (const step of [...STUDENT_STEPS, ...TRAINER_STEPS]) {
      expect(step.title).toBeTruthy();
      expect(step.text).toBeTruthy();
      expect(step.icon).toBeTruthy();
    }
    expect(TUTORIAL_EVENT).toBe('eafit:tutorial');
  });

  it('marca por papel e usuário separadamente', () => {
    localStorage.setItem('eafit_tutorial_done:student:u1', '1');
    expect(hasSeenTutorial('student', 'u1')).toBe(true);
    expect(hasSeenTutorial('trainer', 'u1')).toBe(false);
    expect(hasSeenTutorial('student', 'u2')).toBe(false);
  });
});

describe('ExerciseDemo', () => {
  const frames = { id: 'abc', frames: ['/f0.webp', '/f1.webp'] };
  const video = { stock: true, type: 'video', url: '/v.mp4', credit: 'Crédito do vídeo' };

  it('não renderiza sem mídia', () => {
    const { container } = render(<ExerciseDemo nome="Algo" />);
    expect(container.firstChild).toBeNull();
  });

  it('passa a mídia própria ao buscar', () => {
    h.custom.value = { supino: { url: '/x.gif', type: 'image' } };
    render(<ExerciseDemo nome="Supino" />);
    expect(h.media.args[0]).toBe('Supino');
    expect(h.media.args[2]).toBe(h.custom.value);
  });

  it('abre o modal com quadros, técnica e crédito; fecha no ✕', () => {
    h.media.value = frames;
    render(<ExerciseDemo nome="Supino reto" tecnica="Cotovelos a 45°" variant="button" />);
    const btn = screen.getByText('Ver execução').closest('button');
    expect(btn.className).toContain('demo-btn--button');
    fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: 'Execução: Supino reto' })).toBeTruthy();
    expect(screen.getByText('💡 Cotovelos a 45°')).toBeTruthy();
    expect(screen.getByText(/Imagens:/)).toBeTruthy();
    expect(document.body.classList.contains('modal-open')).toBe(true);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('quadros: carregando até as duas imagens, pausa/continua no toque', () => {
    h.media.value = frames;
    render(<ExerciseDemo nome="Supino" />);
    fireEvent.click(screen.getByText('Ver execução'));
    expect(document.querySelector('.demo-modal__loading')).toBeTruthy();
    document.querySelectorAll('.demo-modal__frame').forEach(img => fireEvent.load(img));
    expect(document.querySelector('.demo-modal__loading')).toBeNull();
    const stage = screen.getByRole('button', { name: 'Pausar demonstração' });
    fireEvent.click(stage);
    expect(screen.getByRole('button', { name: 'Continuar demonstração' })).toBeTruthy();
    expect(document.querySelector('.demo-modal__badge').textContent).toBe('▶');
  });

  it('quadros alternam a cada 1,6s depois de carregados', () => {
    vi.useFakeTimers();
    h.media.value = frames;
    render(<ExerciseDemo nome="Supino" />);
    fireEvent.click(screen.getByText('Ver execução'));
    document.querySelectorAll('.demo-modal__frame').forEach(img => fireEvent.load(img));
    const on = () => [...document.querySelectorAll('.demo-modal__frame')].findIndex(i => i.className.includes('--on'));
    expect(on()).toBe(0);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(on()).toBe(1);
  });

  it('erro ao carregar um quadro mostra aviso offline e desabilita o toque', () => {
    h.media.value = frames;
    render(<ExerciseDemo nome="Supino" />);
    fireEvent.click(screen.getByText('Ver execução'));
    fireEvent.error(document.querySelector('.demo-modal__frame'));
    expect(screen.getByText(/Sem conexão/)).toBeTruthy();
    expect(document.querySelector('.demo-modal__stage').disabled).toBe(true);
  });

  it('vídeo: pausa e continua pelo toque, crédito próprio e velocidade', () => {
    h.media.value = video;
    render(<ExerciseDemo nome="Supino" />);
    fireEvent.click(screen.getByText('Ver execução'));
    const vid = document.querySelector('video');
    vid.play = vi.fn().mockResolvedValue();
    vid.pause = vi.fn();
    fireEvent.loadedData(vid);
    expect(screen.getByText('Crédito do vídeo')).toBeTruthy();
    Object.defineProperty(vid, 'paused', { configurable: true, value: false });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar vídeo' }));
    expect(vid.pause).toHaveBeenCalled();
    Object.defineProperty(vid, 'paused', { configurable: true, value: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar vídeo' }));
    expect(vid.play).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Câmera lenta'));
    expect(vid.playbackRate).toBe(0.5);
    expect(screen.getByText('Câmera lenta').getAttribute('aria-pressed')).toBe('true');
  });

  it('mídia própria em imagem não oferece velocidade nem pausa', () => {
    h.media.value = { custom: true, type: 'image', url: '/a.gif' };
    render(<ExerciseDemo nome="Supino" />);
    fireEvent.click(screen.getByText('Ver execução'));
    expect(screen.getByText('Demonstração da equipe EAFIT')).toBeTruthy();
    expect(screen.queryByText('Câmera lenta')).toBeNull();
    expect(document.querySelector('.demo-modal__stage').disabled).toBe(true);
  });

  it('erro no vídeo mostra aviso offline', () => {
    h.media.value = video;
    render(<ExerciseDemo nome="Supino" />);
    fireEvent.click(screen.getByText('Ver execução'));
    fireEvent.error(document.querySelector('video'));
    expect(screen.getByText(/Sem conexão/)).toBeTruthy();
  });
});

describe('useTrainerGoalsSync', () => {
  it('não faz nada sem usuário', () => {
    renderHook(() => useTrainerGoalsSync(null));
    expect(h.goals.fetchMyGoals).not.toHaveBeenCalled();
  });

  it('meta nova: renova a sessão e guarda o marcador', async () => {
    h.goals.fetchMyGoals.mockResolvedValue({ at: '2026-10-06T10:00:00Z' });
    renderHook(() => useTrainerGoalsSync('u1'));
    await waitFor(() => expect(h.auth.refreshSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem('eafit_goals_seen:u1')).toBe('2026-10-06T10:00:00Z'));
  });

  it('meta já vista não renova', async () => {
    localStorage.setItem('eafit_goals_seen:u1', '2026-10-06T10:00:00Z');
    h.goals.fetchMyGoals.mockResolvedValue({ at: '2026-10-06T10:00:00Z' });
    renderHook(() => useTrainerGoalsSync('u1'));
    await waitFor(() => expect(h.goals.fetchMyGoals).toHaveBeenCalled());
    await Promise.resolve();
    expect(h.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('sem metas ou com erro, segue sem renovar', async () => {
    renderHook(() => useTrainerGoalsSync('u1'));
    await waitFor(() => expect(h.goals.fetchMyGoals).toHaveBeenCalled());
    h.goals.fetchMyGoals.mockRejectedValue(new Error('offline'));
    renderHook(() => useTrainerGoalsSync('u2'));
    await waitFor(() => expect(h.goals.fetchMyGoals).toHaveBeenCalledTimes(2));
    expect(h.auth.refreshSession).not.toHaveBeenCalled();
  });
});
