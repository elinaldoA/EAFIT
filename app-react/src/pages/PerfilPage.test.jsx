// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { auth, workout, appConfig, mockToast, weight, plans, templates, invite } = vi.hoisted(() => ({
  auth: {},
  workout: {},
  appConfig: { config: { flags: {} } },
  mockToast: vi.fn(),
  weight: { fetchWeightLogs: vi.fn(), upsertWeightLog: vi.fn() },
  plans: { createGeneratedPlan: vi.fn() },
  templates: { generatePlan: vi.fn() },
  invite: { shareInvite: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../context/useAppConfig', () => ({ useAppConfig: () => appConfig }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => workout }));
vi.mock('../context/useToast', () => ({ useToast: () => mockToast }));
vi.mock('../context/useAvatar', () => ({ useAvatar: () => ({ avatarData: null, setAvatarData: vi.fn() }) }));
vi.mock('../hooks/useProfileData', () => ({
  useProfileData: () => ({ stats: {}, weightLogs: [], setWeightLogs: vi.fn() }),
}));
vi.mock('../hooks/useReminders', () => ({ useReminders: () => [false, vi.fn()] }));
vi.mock('../lib/weightLog', () => weight);
vi.mock('../lib/workoutPlans', () => plans);
vi.mock('../data/workoutTemplates', () => templates);
vi.mock('../lib/invite', () => invite);
vi.mock('../lib/tutorial', () => ({ startTutorial: vi.fn() }));
vi.mock('../lib/avatar', () => ({ saveAvatar: vi.fn() }));
vi.mock('../data/treinoData', async (importOriginal) => ({ ...(await importOriginal()), todayDate: () => '2026-10-07' }));

// Seções viram stubs que expõem só o que a página passa a elas (dados e ações).
vi.mock('../components/CollapsibleCard', () => ({
  default: ({ title, summary, children }) => (
    <div data-testid={`card-${title}`}><h3>{title}</h3><span data-testid={`summary-${title}`}>{summary}</span>{children}</div>
  ),
}));
vi.mock('../components/ProfileHeader', () => ({ default: () => null }));
vi.mock('../components/ProfileFeedbackSection', () => ({ default: () => <div data-testid="feedback" /> }));
vi.mock('../components/ProfilePauseSection', () => ({ default: () => null }));
vi.mock('../components/ProfileTrainerSection', () => ({ default: () => null }));
vi.mock('../components/LanguageSwitch', () => ({ default: () => null }));
vi.mock('../components/ProfilePreferencesSection', () => ({ NotificationsSection: () => null, ExportSection: () => null }));
vi.mock('../components/ProfilePersonalSection', () => ({
  default: ({ nome, setNome, onSave }) => (
    <div>
      <input aria-label="nome" value={nome} onChange={e => setNome(e.target.value)} />
      <button onClick={onSave}>salvar pessoais</button>
    </div>
  ),
}));
vi.mock('../components/ProfileBodySection', () => ({
  default: ({ peso, setPeso, altura, setAltura, onSave, onRegeneratePlan }) => (
    <div>
      <input aria-label="peso" value={peso} onChange={e => setPeso(e.target.value)} />
      <input aria-label="altura" value={altura} onChange={e => setAltura(e.target.value)} />
      <button onClick={onSave}>salvar corpo</button>
      <button onClick={onRegeneratePlan}>gerar treino</button>
    </div>
  ),
}));
vi.mock('../components/ProfileGoalsSection', () => ({
  WeeklyGoalSection: ({ weeklyGoal, setWeeklyGoal, onSave }) => (
    <div>
      <input aria-label="meta semanal" value={weeklyGoal} onChange={e => setWeeklyGoal(e.target.value)} />
      <button onClick={onSave}>salvar meta semanal</button>
    </div>
  ),
  MacrosSection: ({ macroAgua, setMacroAgua, onSave }) => (
    <div>
      <input aria-label="meta de água" value={macroAgua} onChange={e => setMacroAgua(e.target.value)} />
      <button onClick={onSave}>salvar meta de água</button>
    </div>
  ),
}));
vi.mock('../components/ProfileAccountSection', () => ({
  default: ({ newEmail, setNewEmail, onUpdateEmail, newPassword, setNewPassword, onUpdatePassword, onLogout, onDeleteAccount }) => (
    <div>
      <input aria-label="novo e-mail" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
      <button onClick={onUpdateEmail}>trocar e-mail</button>
      <input aria-label="nova senha" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
      <button onClick={onUpdatePassword}>trocar senha</button>
      <button onClick={onLogout}>sair</button>
      <button onClick={onDeleteAccount}>excluir conta</button>
    </div>
  ),
}));

import PerfilPage from './PerfilPage';

const USER = { id: 'u1', user_metadata: { nome: 'Ana', peso: '70', altura: '175', meta: 'massa', nivel: 'intermediario' } };

function type(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  appConfig.config = { flags: {} };
  Object.assign(auth, {
    user: USER,
    logout: vi.fn(),
    updateProfile: vi.fn().mockResolvedValue({ error: null }),
    updateEmail: vi.fn().mockResolvedValue({}),
    updatePassword: vi.fn().mockResolvedValue({}),
    deleteAccount: vi.fn().mockResolvedValue({}),
  });
  Object.assign(workout, { markPending: vi.fn(), refreshPlan: vi.fn().mockResolvedValue(undefined), planByTrainer: false });
  weight.fetchWeightLogs.mockResolvedValue([]);
  weight.upsertWeightLog.mockResolvedValue(undefined);
  plans.createGeneratedPlan.mockResolvedValue(undefined);
  templates.generatePlan.mockResolvedValue([{ dia: 'Segunda' }]);
  invite.shareInvite.mockResolvedValue('shared');
});

describe('PerfilPage', () => {
  it('os resumos dos cartões refletem os dados do perfil', () => {
    render(<PerfilPage active />);
    expect(screen.getByTestId('summary-Dados pessoais').textContent).toBe('Ana');
    expect(screen.getByTestId('summary-Meu corpo').textContent).toMatch(/^70kg · 175cm · IMC /);
    expect(screen.getByTestId('summary-Metas').textContent).toContain('treinos/semana');
  });

  it('usa o cache local quando o perfil na nuvem ainda não tem o dado', () => {
    auth.user = { id: 'u1', user_metadata: {} };
    localStorage.setItem('profile_nome', 'Bia');
    render(<PerfilPage active />);
    expect(screen.getByLabelText('nome').value).toBe('Bia');
  });

  describe('dados pessoais', () => {
    it('salva na conta e no cache local', async () => {
      render(<PerfilPage active />);
      type('nome', 'Carla');
      fireEvent.click(screen.getByText('salvar pessoais'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('✅ Dados pessoais salvos!'));
      expect(auth.updateProfile).toHaveBeenCalledWith({ nome: 'Carla', sobrenome: '', apelido: '' });
      expect(localStorage.getItem('profile_nome')).toBe('Carla');
    });

    it('falha ao salvar: avisa e não grava o cache', async () => {
      auth.updateProfile.mockResolvedValue({ error: new Error('rede') });
      render(<PerfilPage active />);
      type('nome', 'Carla');
      fireEvent.click(screen.getByText('salvar pessoais'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('⚠️ Não foi possível salvar — tente novamente'));
      expect(localStorage.getItem('profile_nome')).toBeNull();
    });
  });

  describe('meu corpo', () => {
    it('salva o perfil e registra o peso de hoje', async () => {
      render(<PerfilPage active />);
      type('peso', '72.5');
      fireEvent.click(screen.getByText('salvar corpo'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Perfil salvo!'));
      expect(auth.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ peso: '72.5', altura: '175' }));
      expect(weight.upsertWeightLog).toHaveBeenCalledWith('u1', '2026-10-07', 72.5);
      expect(localStorage.getItem('profile_peso')).toBe('72.5');
    });

    it('peso novo na mesma faixa de IMC não mexe no treino', async () => {
      render(<PerfilPage active />);
      type('peso', '72.5');
      fireEvent.click(screen.getByText('salvar corpo'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Perfil salvo!'));
      expect(plans.createGeneratedPlan).not.toHaveBeenCalled();
    });

    it('peso novo que muda a faixa de IMC gera e ativa o treino sozinho, sem confirmação', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      render(<PerfilPage active />);
      type('peso', '80'); // 175cm: IMC 22,9 (normal) -> 26,1 (sobrepeso)
      fireEvent.click(screen.getByText('salvar corpo'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('✅ Perfil salvo — seu IMC mudou de faixa e o treino foi atualizado automaticamente'));
      expect(confirm).not.toHaveBeenCalled();
      expect(templates.generatePlan).toHaveBeenCalledWith({ peso: 80, altura: 175, meta: 'massa', nivel: 'intermediario' });
      expect(plans.createGeneratedPlan).toHaveBeenCalledWith('u1', expect.any(String), [{ dia: 'Segunda' }]);
      expect(workout.refreshPlan).toHaveBeenCalled();
      expect(weight.upsertWeightLog).toHaveBeenCalledWith('u1', '2026-10-07', 80);
    });

    it('plano do personal não é trocado mesmo mudando a faixa de IMC', async () => {
      workout.planByTrainer = true;
      render(<PerfilPage active />);
      type('peso', '80');
      fireEvent.click(screen.getByText('salvar corpo'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Perfil salvo!'));
      expect(plans.createGeneratedPlan).not.toHaveBeenCalled();
    });

    it('falha ao atualizar o treino: o perfil fica salvo e avisa', async () => {
      plans.createGeneratedPlan.mockRejectedValue(new Error('rpc'));
      render(<PerfilPage active />);
      type('peso', '80');
      fireEvent.click(screen.getByText('salvar corpo'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('⚠️ Perfil salvo, mas não deu pra atualizar o treino — use "Gerar novo treino com esses dados"'));
      expect(localStorage.getItem('profile_peso')).toBe('80');
      expect(workout.refreshPlan).not.toHaveBeenCalled();
    });

    it('falha ao registrar o peso: enfileira para sincronizar depois', async () => {
      weight.upsertWeightLog.mockRejectedValue(new Error('offline'));
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('salvar corpo'));
      await waitFor(() => expect(workout.markPending).toHaveBeenCalled());
      expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))[0])
        .toMatchObject({ type: 'weight_log', payload: { userId: 'u1', date: '2026-10-07', peso: 70 } });
      expect(mockToast).toHaveBeenCalledWith('Perfil salvo!');
    });
  });

  describe('gerar novo treino', () => {
    it('sem peso e altura pede o preenchimento antes', async () => {
      auth.user = { id: 'u1', user_metadata: {} };
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('gerar treino'));
      expect(mockToast).toHaveBeenCalledWith('⚠️ Preencha peso e altura antes de gerar um novo treino');
      expect(plans.createGeneratedPlan).not.toHaveBeenCalled();
    });

    it('cancelando a confirmação não cria plano', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('gerar treino'));
      expect(plans.createGeneratedPlan).not.toHaveBeenCalled();
    });

    it('confirmando gera, ativa e recarrega o plano', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('gerar treino'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('✅ Novo treino gerado e ativado!'));
      expect(templates.generatePlan).toHaveBeenCalledWith({ peso: 70, altura: 175, meta: 'massa', nivel: 'intermediario' });
      expect(plans.createGeneratedPlan).toHaveBeenCalledWith('u1', expect.any(String), [{ dia: 'Segunda' }]);
      expect(workout.refreshPlan).toHaveBeenCalled();
    });

    it('plano do personal pede uma confirmação extra', () => {
      workout.planByTrainer = true;
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('gerar treino'));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0][0]).toContain('montado pelo seu personal');
    });

    it('erro ao gerar avisa', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      plans.createGeneratedPlan.mockRejectedValue(new Error('rpc'));
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('gerar treino'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('⚠️ Erro ao gerar novo treino'));
      expect(workout.refreshPlan).not.toHaveBeenCalled();
    });
  });

  describe('metas', () => {
    it('salva a meta semanal e a de água', async () => {
      render(<PerfilPage active />);
      type('meta semanal', '4');
      fireEvent.click(screen.getByText('salvar meta semanal'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('📅 Meta semanal salva!'));
      expect(auth.updateProfile).toHaveBeenCalledWith({ weeklyGoal: '4' });
      expect(localStorage.getItem('profile_weeklyGoal')).toBe('4');

      type('meta de água', '3');
      fireEvent.click(screen.getByText('salvar meta de água'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('🎯 Meta de água salva!'));
      expect(auth.updateProfile).toHaveBeenCalledWith({ macroAgua: '3' });
    });
  });

  describe('conta', () => {
    it('trocar e-mail confirma e limpa o campo; erro mostra a mensagem', async () => {
      render(<PerfilPage active />);
      type('novo e-mail', 'novo@exemplo.com');
      fireEvent.click(screen.getByText('trocar e-mail'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('✅ Confirme o e-mail enviado para a nova conta'));
      expect(auth.updateEmail).toHaveBeenCalledWith('novo@exemplo.com');
      expect(screen.getByLabelText('novo e-mail').value).toBe('');

      auth.updateEmail.mockResolvedValue({ error: 'E-mail já em uso.' });
      type('novo e-mail', 'outro@exemplo.com');
      fireEvent.click(screen.getByText('trocar e-mail'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('⚠️ E-mail já em uso.'));
    });

    it('campos vazios não chamam o servidor', () => {
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('trocar e-mail'));
      fireEvent.click(screen.getByText('trocar senha'));
      expect(auth.updateEmail).not.toHaveBeenCalled();
      expect(auth.updatePassword).not.toHaveBeenCalled();
    });

    it('trocar senha confirma; excluir conta com erro avisa', async () => {
      render(<PerfilPage active />);
      type('nova senha', 'segredo123');
      fireEvent.click(screen.getByText('trocar senha'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('✅ Senha atualizada'));
      expect(auth.updatePassword).toHaveBeenCalledWith('segredo123');

      auth.deleteAccount.mockResolvedValue({ error: 'Não foi possível excluir a conta agora.' });
      fireEvent.click(screen.getByText('excluir conta'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('⚠️ Não foi possível excluir a conta agora.'));
    });

    it('sair chama o logout', () => {
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('sair'));
      expect(auth.logout).toHaveBeenCalled();
    });
  });

  describe('atalhos e chaves do painel admin', () => {
    it('"Peso e fotos" abre a aba Corpo da Evolução', () => {
      render(<PerfilPage active />);
      fireEvent.click(screen.getByText('Peso e fotos de progresso'));
      expect(localStorage.getItem('dash_tab')).toBe('corpo');
      expect(window.location.hash).toBe('#dash');
    });

    it('convidar amigos copiado avisa; chaves desligadas escondem convite e feedback', async () => {
      invite.shareInvite.mockResolvedValue('copied');
      const { unmount } = render(<PerfilPage active />);
      expect(screen.getByTestId('feedback')).toBeTruthy();
      fireEvent.click(screen.getByText('Convidar amigos'));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith('🔗 Link copiado — cole na conversa com seus amigos'));
      unmount();

      appConfig.config = { flags: { convite_amigos: false, feedback: false } };
      render(<PerfilPage active />);
      expect(screen.queryByText('Convidar amigos')).toBeNull();
      expect(screen.queryByTestId('feedback')).toBeNull();
    });
  });
});
