// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  auth: { user: { id: 'u1', user_metadata: { nivel: 'iniciante' } }, updatePassword: vi.fn(), finishRecovery: vi.fn(), logout: vi.fn(), updateProfile: vi.fn() },
  toast: vi.fn(),
  disc: { fetchRecentDiscomfort: vi.fn(), logDiscomfort: vi.fn() },
  checkin: { fetchCheckins: vi.fn(), buildCheckinInsights: vi.fn() },
  swap: { fetchSwapContext: vi.fn(), pickAlternatives: vi.fn() },
  plans: { substituteExercise: vi.fn(), seedGeneratedPlan: vi.fn() },
  recap: { buildMonthlyRecap: vi.fn(), fetchRecapWorkouts: vi.fn() },
  share: { shareMonthlyRecap: vi.fn() },
  tpl: { generatePlan: vi.fn() },
  notif: { sendNotification: vi.fn() },
  push: { supported: false },
  water: { goal: 3 },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/discomfort', async orig => ({ ...(await orig()), ...h.disc }));
vi.mock('../lib/checkin', async orig => ({ ...(await orig()), ...h.checkin }));
vi.mock('../lib/exerciseSwap', () => h.swap);
vi.mock('../lib/workoutPlans', () => h.plans);
vi.mock('../lib/monthlyRecap', async orig => ({ ...(await orig()), ...h.recap }));
vi.mock('../lib/shareCard', () => h.share);
vi.mock('../data/workoutTemplates', () => h.tpl);
vi.mock('../lib/notifications', () => h.notif);
vi.mock('../lib/pushSubscriptions', () => ({ isPushSupported: () => h.push.supported }));
vi.mock('../data/treinoData', async orig => ({
  ...(await orig()),
  todayDate: () => '2026-10-07',
  waterStorageKey: () => 'water_2026-10-07',
  getWaterGoalLiters: () => h.water.goal,
}));

import { DiscomfortPanel, DiscomfortHistory } from './DiscomfortWidgets';
import CheckinInsights from './CheckinInsights';
import ExerciseSwap from './ExerciseSwap';
import MonthlyRecap from './MonthlyRecap';
import PasswordRecoveryScreen from './PasswordRecoveryScreen';
import OnboardingScreen from './OnboardingScreen';
import ReminderScheduler from './ReminderScheduler';

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.user = { id: 'u1', user_metadata: { nivel: 'iniciante' } };
  h.auth.updatePassword.mockResolvedValue({});
  h.auth.updateProfile.mockResolvedValue({});
  h.auth.logout.mockResolvedValue();
  h.disc.fetchRecentDiscomfort.mockResolvedValue(null);
  h.disc.logDiscomfort.mockResolvedValue();
  h.checkin.fetchCheckins.mockResolvedValue([]);
  h.swap.fetchSwapContext.mockResolvedValue({ library: [], avoidNames: [] });
  h.swap.pickAlternatives.mockReturnValue({ known: true, options: [] });
  h.plans.substituteExercise.mockResolvedValue();
  h.plans.seedGeneratedPlan.mockResolvedValue();
  h.recap.fetchRecapWorkouts.mockResolvedValue([{ id: 1 }]);
  h.share.shareMonthlyRecap.mockResolvedValue('shared');
  h.tpl.generatePlan.mockResolvedValue([{ dia: 'Seg' }]);
  h.notif.sendNotification.mockResolvedValue();
  h.push.supported = false;
  h.water.goal = 3;
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DiscomfortPanel', () => {
  it('mostra o relato recente do exercício', async () => {
    h.disc.fetchRecentDiscomfort.mockResolvedValue({ severity: 'forte', log_date: '2026-10-05' });
    render(<DiscomfortPanel userId="u1" exerciseName="Supino" toast={h.toast} />);
    expect(await screen.findByText(/Desconforto/)).toBeTruthy();
    expect(screen.getByText(/Forte/)).toBeTruthy();
    expect(h.disc.fetchRecentDiscomfort).toHaveBeenCalledWith('u1', 'Supino');
  });

  it('não consulta sem usuário ou exercício', () => {
    render(<DiscomfortPanel userId={null} exerciseName="Supino" toast={h.toast} />);
    render(<DiscomfortPanel userId="u1" exerciseName="" toast={h.toast} />);
    expect(h.disc.fetchRecentDiscomfort).not.toHaveBeenCalled();
  });

  it('registra o desconforto, atualiza o alerta e fecha o formulário', async () => {
    render(<DiscomfortPanel userId="u1" exerciseName="Supino" toast={h.toast} />);
    fireEvent.click(screen.getByText('⚠️ Reportar desconforto neste exercício'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'moderada' } });
    fireEvent.change(screen.getByPlaceholderText('Nota (opcional)'), { target: { value: ' ombro ' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(h.disc.logDiscomfort).toHaveBeenCalledWith('u1', 'Supino', '2026-10-07', 'moderada', ' ombro '));
    expect(h.toast).toHaveBeenCalledWith('✅ Desconforto registrado');
    expect(await screen.findByText(/Moderada/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Nota (opcional)')).toBeNull();
  });

  it('erro ao registrar avisa e mantém o formulário', async () => {
    h.disc.logDiscomfort.mockRejectedValue(new Error('x'));
    render(<DiscomfortPanel userId="u1" exerciseName="Supino" toast={h.toast} />);
    fireEvent.click(screen.getByText('⚠️ Reportar desconforto neste exercício'));
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Erro ao registrar desconforto'));
    expect(screen.getByText('Salvar')).toBeTruthy();
  });

  it('alterna o botão entre reportar e cancelar', () => {
    render(<DiscomfortPanel userId="u1" exerciseName="Supino" toast={h.toast} />);
    fireEvent.click(screen.getByText('⚠️ Reportar desconforto neste exercício'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Salvar')).toBeNull();
  });
});

describe('DiscomfortHistory', () => {
  it('estado vazio', () => {
    render(<DiscomfortHistory reports={[]} />);
    expect(screen.getByText('Nenhum desconforto relatado ainda.')).toBeTruthy();
  });

  it('lista relatos com severidade, nota e contador de reincidência', () => {
    const reports = [
      { id: 1, exercise_name: 'Supino', severity: 'forte', log_date: '2026-10-05', note: 'ombro' },
      { id: 2, exercise_name: 'Supino', severity: 'leve', log_date: '2026-10-01', note: null },
      { id: 3, exercise_name: 'Remada', severity: 'lesao', log_date: '2026-09-20', note: null },
    ];
    render(<DiscomfortHistory reports={reports} />);
    expect(screen.getAllByText('×2')).toHaveLength(2);
    expect(screen.getByText('ombro')).toBeTruthy();
    expect(screen.getByText('Lesão')).toBeTruthy();
    expect(screen.getByText('Remada').querySelector('.discomfort-history__badge')).toBeNull();
  });
});

describe('CheckinInsights', () => {
  const insights = { energy: 3.5, sleep: 4, mood: 2.5, days: 12, compare: { energyOn: 4, energyOff: 3.2 } };

  it('mostra mensagem enquanto não há insights', async () => {
    h.checkin.buildCheckinInsights.mockReturnValue(null);
    render(<CheckinInsights userId="u1" trainedDates={new Set()} />);
    expect(await screen.findByText(/Responda o check-in/)).toBeTruthy();
    expect(h.checkin.fetchCheckins).toHaveBeenCalledWith('u1', '2026-09-07');
  });

  it('mostra médias com vírgula, comparação e total de check-ins', async () => {
    h.checkin.buildCheckinInsights.mockReturnValue(insights);
    render(<CheckinInsights userId="u1" trainedDates={new Set()} />);
    expect(await screen.findByText('3,5/5')).toBeTruthy();
    expect(screen.getByText('Energia média: 4 nos dias de treino × 3,2 nos outros dias.')).toBeTruthy();
    expect(screen.getByText('12 check-in(s) no período.')).toBeTruthy();
  });

  it('sem comparação não mostra a frase de energia', async () => {
    h.checkin.buildCheckinInsights.mockReturnValue({ ...insights, compare: null });
    render(<CheckinInsights userId="u1" trainedDates={new Set()} />);
    await screen.findByText('12 check-in(s) no período.');
    expect(screen.queryByText(/nos dias de treino/)).toBeNull();
  });

  it('falha na busca cai em lista vazia', async () => {
    h.checkin.fetchCheckins.mockRejectedValue(new Error('x'));
    h.checkin.buildCheckinInsights.mockReturnValue(null);
    render(<CheckinInsights userId="u1" trainedDates={new Set()} />);
    await waitFor(() => expect(h.checkin.buildCheckinInsights).toHaveBeenCalledWith([], expect.anything()));
  });
});

describe('ExerciseSwap', () => {
  const ex = { id: 'x1', nome: 'Supino', series: 3, reps: '10', descanso: '60s' };
  const day = { exercicios: [{ nome: 'Supino' }], pos: [{ nome: 'Prancha' }] };
  const setup = (over = {}) => {
    const onSwapped = vi.fn().mockResolvedValue();
    render(<ExerciseSwap ex={ex} day={day} user={h.auth.user} toast={h.toast} onSwapped={onSwapped} {...over} />);
    return { onSwapped };
  };

  it('abre buscando alternativas com os parâmetros do usuário e do dia', async () => {
    h.swap.pickAlternatives.mockReturnValue({ known: true, options: [{ nome: 'Supino inclinado', equipamento: 'halter' }] });
    setup();
    fireEvent.click(screen.getByText('🔄 Trocar exercício'));
    expect(screen.getByText('Buscando alternativas…')).toBeTruthy();
    expect(await screen.findByText('Supino inclinado')).toBeTruthy();
    expect(screen.getByText('halter')).toBeTruthy();
    expect(h.swap.pickAlternatives).toHaveBeenCalledWith(expect.objectContaining({ current: ex, nivel: 'iniciante', dayNames: ['Supino', 'Prancha'] }));
  });

  it('clicar de novo fecha o painel', async () => {
    setup();
    fireEvent.click(screen.getByText('🔄 Trocar exercício'));
    await screen.findByText('Sem alternativas para o seu nível agora.');
    fireEvent.click(screen.getByText('🔄 Trocar exercício'));
    expect(screen.queryByText('Sem alternativas para o seu nível agora.')).toBeNull();
  });

  it('exercício personalizado não tem alternativas automáticas', async () => {
    h.swap.pickAlternatives.mockReturnValue({ known: false, options: [] });
    setup();
    fireEvent.click(screen.getByText('🔄 Trocar exercício'));
    expect(await screen.findByText(/personalizado/)).toBeTruthy();
  });

  it('erro ao carregar mostra mensagem', async () => {
    h.swap.fetchSwapContext.mockRejectedValue(new Error('x'));
    setup();
    fireEvent.click(screen.getByText('🔄 Trocar exercício'));
    expect(await screen.findByText('Não foi possível carregar as alternativas.')).toBeTruthy();
  });

  it('troca mantendo a prescrição, avisa, fecha e recarrega', async () => {
    h.swap.pickAlternatives.mockReturnValue({ known: true, options: [{ nome: 'Supino inclinado', tecnica: 'pausa' }] });
    const { onSwapped } = setup();
    fireEvent.click(screen.getByText('🔄 Trocar exercício'));
    fireEvent.click(await screen.findByText('Supino inclinado'));
    await waitFor(() => expect(h.plans.substituteExercise).toHaveBeenCalledWith('x1', { nome: 'Supino inclinado', series: 3, reps: '10', descanso: '60s', tecnica: 'pausa' }));
    expect(h.toast).toHaveBeenCalledWith('🔄 Trocado por Supino inclinado');
    expect(onSwapped).toHaveBeenCalled();
    expect(screen.queryByText('Supino inclinado')).toBeNull();
  });

  it('erro na troca avisa e mantém o painel aberto', async () => {
    h.swap.pickAlternatives.mockReturnValue({ known: true, options: [{ nome: 'Supino inclinado' }] });
    h.plans.substituteExercise.mockRejectedValue(new Error('x'));
    setup();
    fireEvent.click(screen.getByText('🔄 Trocar exercício'));
    fireEvent.click(await screen.findByText('Supino inclinado'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao trocar o exercício'));
    expect(screen.getByText('Supino inclinado')).toBeTruthy();
  });
});

describe('MonthlyRecap', () => {
  const recap = (over = {}) => ({
    label: 'outubro', treinos: 8, minutes: 400, volume: 12000, prCount: 3, bestStreak: 4, favWeekday: 'Seg', deltaPct: 25, ...over,
  });

  it('não renderiza até carregar os treinos', () => {
    h.recap.buildMonthlyRecap.mockReturnValue(recap());
    h.recap.fetchRecapWorkouts.mockReturnValue(new Promise(() => {}));
    const { container } = render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('mostra números, comparação positiva e o período', async () => {
    h.recap.buildMonthlyRecap.mockReturnValue(recap());
    render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    expect(await screen.findByText(/Retrospectiva · outubro/)).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('4 dia(s)')).toBeTruthy();
    expect(screen.getByText('Seg')).toBeTruthy();
    expect(screen.getByText('▲ 25% vs. mês anterior')).toBeTruthy();
    expect(h.recap.buildMonthlyRecap).toHaveBeenCalledWith(expect.objectContaining({ today: '2026-10-07', offset: 0 }));
  });

  it('variação negativa usa seta para baixo; nula esconde a linha', async () => {
    h.recap.buildMonthlyRecap.mockReturnValue(recap({ deltaPct: -10 }));
    const { unmount } = render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    expect(await screen.findByText('▼ 10% vs. mês anterior')).toBeTruthy();
    unmount();
    h.recap.buildMonthlyRecap.mockReturnValue(recap({ deltaPct: null }));
    render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    await screen.findByText(/Retrospectiva/);
    expect(screen.queryByText(/vs\. mês anterior/)).toBeNull();
  });

  it('enquanto o histórico carrega, volume e recordes mostram reticências', async () => {
    h.recap.buildMonthlyRecap.mockReturnValue(recap());
    render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs />);
    await screen.findByText(/Retrospectiva/);
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('mês passado recalcula com offset -1', async () => {
    h.recap.buildMonthlyRecap.mockReturnValue(recap());
    render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    await screen.findByText(/Retrospectiva/);
    fireEvent.click(screen.getByText('Mês passado'));
    expect(h.recap.buildMonthlyRecap).toHaveBeenLastCalledWith(expect.objectContaining({ offset: -1 }));
    expect(screen.getByText('Mês passado').getAttribute('aria-pressed')).toBe('true');
  });

  it('sem treinos: mensagem vazia, compartilhar desabilitado, travessões', async () => {
    h.recap.buildMonthlyRecap.mockReturnValue(recap({ treinos: 0, bestStreak: 0, favWeekday: null, deltaPct: null }));
    render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    expect(await screen.findByText('Nenhum treino concluído neste período.')).toBeTruthy();
    expect(screen.getByText('📤 Compartilhar retrospectiva').disabled).toBe(true);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('compartilhar: avisa download, ignora cancelamento e avisa erro', async () => {
    h.recap.buildMonthlyRecap.mockReturnValue(recap());
    render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    const btn = await screen.findByText('📤 Compartilhar retrospectiva');
    h.share.shareMonthlyRecap.mockResolvedValueOnce('downloaded');
    fireEvent.click(btn);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🖼️ Imagem baixada'));
    h.toast.mockClear();
    h.share.shareMonthlyRecap.mockRejectedValueOnce(Object.assign(new Error('c'), { name: 'AbortError' }));
    fireEvent.click(btn);
    await waitFor(() => expect(h.share.shareMonthlyRecap).toHaveBeenCalledTimes(2));
    expect(h.toast).not.toHaveBeenCalled();
    h.share.shareMonthlyRecap.mockRejectedValueOnce(new Error('canvas'));
    fireEvent.click(btn);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao gerar imagem de compartilhamento'));
  });

  it('falha ao buscar treinos mostra a retrospectiva vazia', async () => {
    h.recap.fetchRecapWorkouts.mockRejectedValue(new Error('x'));
    h.recap.buildMonthlyRecap.mockReturnValue(recap({ treinos: 0 }));
    render(<MonthlyRecap userId="u1" allTimeLogs={[]} loadingLogs={false} />);
    expect(await screen.findByText('Nenhum treino concluído neste período.')).toBeTruthy();
    expect(h.recap.buildMonthlyRecap).toHaveBeenCalledWith(expect.objectContaining({ workouts: [] }));
  });
});

describe('PasswordRecoveryScreen', () => {
  const fill = (a, b) => {
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: a } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: b } });
  };

  it('senhas diferentes mostram erro sem chamar a API', () => {
    render(<PasswordRecoveryScreen />);
    fill('123456', '654321');
    fireEvent.click(screen.getByText('Salvar nova senha'));
    expect(screen.getByRole('status').textContent).toBe('As senhas não coincidem.');
    expect(h.auth.updatePassword).not.toHaveBeenCalled();
  });

  it('salva, avisa e finaliza a recuperação', async () => {
    render(<PasswordRecoveryScreen />);
    fill('123456', '123456');
    fireEvent.click(screen.getByText('Salvar nova senha'));
    await waitFor(() => expect(h.auth.finishRecovery).toHaveBeenCalled());
    expect(h.auth.updatePassword).toHaveBeenCalledWith('123456');
    expect(h.toast).toHaveBeenCalledWith('✅ Senha alterada com sucesso');
  });

  it('erro da API é mostrado e a recuperação continua', async () => {
    h.auth.updatePassword.mockResolvedValue({ error: 'Senha fraca' });
    render(<PasswordRecoveryScreen />);
    fill('123456', '123456');
    fireEvent.click(screen.getByText('Salvar nova senha'));
    expect(await screen.findByText('Senha fraca')).toBeTruthy();
    expect(h.auth.finishRecovery).not.toHaveBeenCalled();
  });

  it('cancelar encerra a recuperação e sai da conta', async () => {
    render(<PasswordRecoveryScreen />);
    fireEvent.click(screen.getByText('Cancelar e sair'));
    await waitFor(() => expect(h.auth.logout).toHaveBeenCalled());
    expect(h.auth.finishRecovery).toHaveBeenCalled();
  });
});

describe('OnboardingScreen', () => {
  const fill = ({ sexo = 'M', idade = '30', peso = '80', altura = '180' } = {}) => {
    fireEvent.change(screen.getByLabelText('Sexo biológico'), { target: { value: sexo } });
    fireEvent.change(screen.getByLabelText('Idade'), { target: { value: idade } });
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: peso } });
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: altura } });
  };
  const submit = () => fireEvent.click(screen.getByText('Gerar meu treino'));

  it.each([
    [{ sexo: '' }, 'Preencha sexo e uma idade válida (14–100).'],
    [{ idade: '10' }, 'Preencha sexo e uma idade válida (14–100).'],
    [{ peso: '10' }, 'Informe um peso válido (kg).'],
    [{ altura: '50' }, 'Informe uma altura válida (cm).'],
  ])('valida %j', (values, message) => {
    render(<OnboardingScreen />);
    fill(values);
    submit();
    expect(screen.getByText(message)).toBeTruthy();
    expect(h.tpl.generatePlan).not.toHaveBeenCalled();
  });

  it('gera e semeia o plano ANTES de salvar o perfil', async () => {
    const order = [];
    h.tpl.generatePlan.mockImplementation(async () => { order.push('generate'); return [{ dia: 'Seg' }]; });
    h.plans.seedGeneratedPlan.mockImplementation(async () => { order.push('seed'); });
    h.auth.updateProfile.mockImplementation(async () => { order.push('profile'); return {}; });
    render(<OnboardingScreen />);
    fill();
    fireEvent.change(screen.getByLabelText('Objetivo principal'), { target: { value: 'forca' } });
    fireEvent.change(screen.getByLabelText('Nível de experiência'), { target: { value: 'avancado' } });
    submit();
    await waitFor(() => expect(h.auth.updateProfile).toHaveBeenCalled());
    expect(order).toEqual(['generate', 'seed', 'profile']);
    expect(h.tpl.generatePlan).toHaveBeenCalledWith({ sexo: 'M', idade: 30, peso: 80, altura: 180, meta: 'forca', nivel: 'avancado' });
    expect(h.plans.seedGeneratedPlan).toHaveBeenCalledWith('u1', [{ dia: 'Seg' }]);
    expect(h.auth.updateProfile).toHaveBeenCalledWith({ sexo: 'M', idade: 30, peso: 80, altura: 180, meta: 'forca', nivel: 'avancado' });
  });

  it('erro ao gerar o plano mostra mensagem e toast, e não salva o perfil', async () => {
    h.tpl.generatePlan.mockRejectedValue(new Error('x'));
    render(<OnboardingScreen />);
    fill();
    submit();
    expect(await screen.findByText('⚠️ Não foi possível gerar seu plano — tente novamente.')).toBeTruthy();
    expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao criar seu plano personalizado');
    expect(h.auth.updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText('Gerar meu treino').disabled).toBe(false);
  });

  it('erro do updateProfile também é tratado', async () => {
    h.auth.updateProfile.mockResolvedValue({ error: new Error('rls') });
    render(<OnboardingScreen />);
    fill();
    submit();
    expect(await screen.findByText('⚠️ Não foi possível gerar seu plano — tente novamente.')).toBeTruthy();
  });
});

describe('ReminderScheduler', () => {
  const at = (hh, mm) => new Date(2026, 9, 7, hh, mm, 0);
  const advance = async ms => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    localStorage.setItem('reminders_enabled', 'true');
  });

  it('dispara o lembrete de água no horário quando abaixo da meta', async () => {
    vi.setSystemTime(at(9, 0));
    localStorage.setItem('water_2026-10-07', '1200');
    render(<ReminderScheduler />);
    await advance(0);
    expect(h.notif.sendNotification).toHaveBeenCalledWith('💧 Hora de beber água', expect.objectContaining({
      body: 'Você bebeu 1.2L de 3.0L hoje.', tag: 'water-2026-10-07-09:00',
    }));
  });

  it('não repete no mesmo horário', async () => {
    vi.setSystemTime(at(9, 0));
    render(<ReminderScheduler />);
    await advance(0);
    await advance(30000);
    expect(h.notif.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('não dispara se já bateu a meta, fora do horário ou com lembretes desligados', async () => {
    vi.setSystemTime(at(9, 0));
    localStorage.setItem('water_2026-10-07', '3500');
    const { unmount } = render(<ReminderScheduler />);
    await advance(0);
    unmount();
    vi.setSystemTime(at(9, 30));
    localStorage.setItem('water_2026-10-07', '0');
    const second = render(<ReminderScheduler />);
    await advance(0);
    second.unmount();
    vi.setSystemTime(at(9, 0));
    localStorage.setItem('reminders_enabled', 'false');
    render(<ReminderScheduler />);
    await advance(0);
    expect(h.notif.sendNotification).not.toHaveBeenCalled();
  });

  it('checa a cada 30s e dispara quando chega o horário', async () => {
    vi.setSystemTime(at(10, 59));
    render(<ReminderScheduler />);
    await advance(0);
    expect(h.notif.sendNotification).not.toHaveBeenCalled();
    await advance(60000);
    expect(h.notif.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('com push ativo o fallback local não dispara (o servidor cobre)', async () => {
    h.push.supported = true;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve({ endpoint: 'x' }) } }) },
    });
    vi.setSystemTime(at(9, 0));
    render(<ReminderScheduler />);
    await advance(0);
    await advance(30000);
    expect(h.notif.sendNotification).not.toHaveBeenCalled();
    delete navigator.serviceWorker;
  });

  it('push suportado mas falha ao checar: mantém o fallback', async () => {
    h.push.supported = true;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.reject(new Error('sw')) },
    });
    vi.setSystemTime(at(9, 0));
    render(<ReminderScheduler />);
    await advance(0);
    expect(h.notif.sendNotification).toHaveBeenCalledTimes(1);
    delete navigator.serviceWorker;
  });

  it('erro ao enviar notificação é registrado sem quebrar', async () => {
    h.notif.sendNotification.mockRejectedValue(new Error('bloqueada'));
    vi.setSystemTime(at(9, 0));
    render(<ReminderScheduler />);
    await advance(0);
    expect(console.error).toHaveBeenCalledWith('sendNotification:', expect.any(Error));
  });

  it('para de checar ao desmontar', async () => {
    vi.setSystemTime(at(10, 59));
    const { unmount } = render(<ReminderScheduler />);
    await advance(0);
    unmount();
    await advance(120000);
    expect(h.notif.sendNotification).not.toHaveBeenCalled();
  });
});
