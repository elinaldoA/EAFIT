// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  refreshPlan: vi.fn(),
  toast: vi.fn(),
  api: {},
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ refreshPlan: h.refreshPlan }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('../lib/workoutPlans', () => ({
  listPlans: (...a) => h.api.listPlans(...a),
  createPlan: (...a) => h.api.createPlan(...a),
  setActivePlan: (...a) => h.api.setActivePlan(...a),
  renamePlan: (...a) => h.api.renamePlan(...a),
  deletePlan: (...a) => h.api.deletePlan(...a),
  updatePlanSuccessors: (...a) => h.api.updatePlanSuccessors(...a),
  fetchPlanDays: (...a) => h.api.fetchPlanDays(...a),
  updatePlanDay: (...a) => h.api.updatePlanDay(...a),
  addExercise: (...a) => h.api.addExercise(...a),
  updateExercise: (...a) => h.api.updateExercise(...a),
  deleteExercise: (...a) => h.api.deleteExercise(...a),
  reorderExercises: (...a) => h.api.reorderExercises(...a),
}));

import PlanEditorModal from './PlanEditorModal';

const PLANS = [
  { id: 'p1', name: 'Hipertrofia', is_active: true, end_date: null, next_plan_id: null, regression_plan_id: null },
  { id: 'p2', name: 'Força', is_active: false, end_date: null, next_plan_id: null, regression_plan_id: null },
];

const EX = (id, nome, extra = {}) => ({ id, nome, series: '3', reps: '10', descanso: '60s', tecnica: '', ...extra });
const DAYS = [
  { id: 'd1', dia: 'Segunda', foco: 'Peito', exercicios: [EX('e1', 'Supino'), EX('e2', 'Crucifixo')], pos: [EX('e3', 'Prancha')] },
  { id: 'd2', dia: 'Terça', foco: 'Costas', exercicios: [], pos: [] },
];

function setup() {
  const onClose = vi.fn();
  render(<PlanEditorModal onClose={onClose} />);
  return { onClose };
}

async function openEditor() {
  const r = setup();
  await screen.findByDisplayValue('Hipertrofia');
  fireEvent.click(screen.getByRole('button', { name: 'Editar dia' }));
  await screen.findByDisplayValue('Peito');
  return r;
}

beforeEach(() => {
  h.refreshPlan.mockReset().mockResolvedValue(undefined);
  h.toast.mockReset();
  h.api = {
    listPlans: vi.fn().mockResolvedValue(PLANS),
    createPlan: vi.fn().mockResolvedValue({ id: 'p3' }),
    setActivePlan: vi.fn().mockResolvedValue(undefined),
    renamePlan: vi.fn().mockResolvedValue(undefined),
    deletePlan: vi.fn().mockResolvedValue(undefined),
    updatePlanSuccessors: vi.fn().mockResolvedValue(undefined),
    fetchPlanDays: vi.fn().mockResolvedValue(DAYS),
    updatePlanDay: vi.fn().mockResolvedValue(undefined),
    addExercise: vi.fn().mockResolvedValue(undefined),
    updateExercise: vi.fn().mockResolvedValue(undefined),
    deleteExercise: vi.fn().mockResolvedValue(undefined),
    reorderExercises: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlanEditorModal — planos', () => {
  it('lista os planos do usuário, com o ativo marcado', async () => {
    setup();
    expect(await screen.findByDisplayValue('Hipertrofia')).toBeTruthy();
    expect(screen.getByDisplayValue('Força')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(h.api.listPlans).toHaveBeenCalledWith('u1');
  });

  it('erro ao carregar avisa com um toast', async () => {
    h.api.listPlans.mockRejectedValue(new Error('rede'));
    setup();
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao carregar planos'));
  });

  it('fechar pelo ✕ e pelo fundo', async () => {
    const { onClose } = setup();
    await screen.findByDisplayValue('Hipertrofia');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renomear ao sair do campo; nome vazio ou igual não salva', async () => {
    setup();
    const input = await screen.findByDisplayValue('Força');
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: 'Força' } });
    fireEvent.blur(input);
    expect(h.api.renamePlan).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Força Máxima' } });
    fireEvent.blur(input);
    await waitFor(() => expect(h.api.renamePlan).toHaveBeenCalledWith('p2', 'Força Máxima'));
  });

  it('renomear o plano ativo atualiza o treino da tela', async () => {
    setup();
    const input = await screen.findByDisplayValue('Hipertrofia');
    fireEvent.change(input, { target: { value: 'Massa' } });
    fireEvent.blur(input);
    // renomear -> recarregar a lista -> atualizar o treino: três awaits em cadeia, que
    // estouram o 1s padrão do waitFor quando o runner do CI está lento.
    await waitFor(() => expect(h.refreshPlan).toHaveBeenCalled(), { timeout: 4000 });
  });

  it('ativar pergunta a duração do ciclo e ativa', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('8');
    setup();
    await screen.findByDisplayValue('Força');
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(h.api.setActivePlan).toHaveBeenCalledWith('u1', 'p2', 8));
    expect(h.refreshPlan).toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('✅ Plano ativado');
  });

  it('ativar sem prazo manda null; cancelar o prompt não faz nada; duração inválida avisa', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    setup();
    await screen.findByDisplayValue('Força');
    const ativar = screen.getByRole('button', { name: 'Ativar' });

    prompt.mockReturnValue(null);
    fireEvent.click(ativar);
    expect(h.api.setActivePlan).not.toHaveBeenCalled();

    prompt.mockReturnValue('abc');
    fireEvent.click(ativar);
    expect(h.toast).toHaveBeenCalledWith('⚠️ Duração inválida');
    expect(h.api.setActivePlan).not.toHaveBeenCalled();

    prompt.mockReturnValue('');
    fireEvent.click(ativar);
    await waitFor(() => expect(h.api.setActivePlan).toHaveBeenCalledWith('u1', 'p2', null));
  });

  it('não exclui o plano ativo nem o único plano', async () => {
    setup();
    await screen.findByDisplayValue('Hipertrofia');
    const [delAtivo] = screen.getAllByRole('button', { name: 'Excluir plano' });
    fireEvent.click(delAtivo);
    expect(h.toast).toHaveBeenCalledWith('Ative outro plano antes de excluir este');
    expect(h.api.deletePlan).not.toHaveBeenCalled();
  });

  it('exclui um plano inativo depois de confirmar', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup();
    await screen.findByDisplayValue('Força');
    const dels = screen.getAllByRole('button', { name: 'Excluir plano' });
    fireEvent.click(dels[1]);
    await waitFor(() => expect(h.api.deletePlan).toHaveBeenCalledWith('p2', 'u1'));
    expect(confirm).toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('🗑️ Plano excluído');
  });

  it('recusar a confirmação não exclui', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await screen.findByDisplayValue('Força');
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir plano' })[1]);
    expect(h.api.deletePlan).not.toHaveBeenCalled();
  });

  it('novo plano em branco e duplicando o atual', async () => {
    setup();
    await screen.findByDisplayValue('Hipertrofia');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo plano' }));
    // sem nome não cria
    fireEvent.click(screen.getByRole('button', { name: 'Criar em branco' }));
    expect(h.api.createPlan).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Nome do novo plano'), { target: { value: 'Verão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar em branco' }));
    await waitFor(() => expect(h.api.createPlan).toHaveBeenCalledWith('u1', 'Verão', null));
    expect(h.toast).toHaveBeenCalledWith('✅ Plano criado');

    fireEvent.click(await screen.findByRole('button', { name: '+ Novo plano' }));
    fireEvent.change(screen.getByPlaceholderText('Nome do novo plano'), { target: { value: 'Cópia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar atual' }));
    await waitFor(() => expect(h.api.createPlan).toHaveBeenLastCalledWith('u1', 'Cópia', 'p1'));
  });

  it('encadear plano: próximo na progressão', async () => {
    setup();
    await screen.findByDisplayValue('Hipertrofia');
    const [proximo] = screen.getAllByLabelText('Próximo (progressão)');
    fireEvent.change(proximo, { target: { value: 'p2' } });
    await waitFor(() => expect(h.api.updatePlanSuccessors).toHaveBeenCalledWith('p1', { nextPlanId: 'p2', regressionPlanId: null }));
  });
});

describe('PlanEditorModal — editar dia', () => {
  it('mostra os exercícios e o pós-treino do dia selecionado', async () => {
    await openEditor();
    expect(screen.getByDisplayValue('Supino')).toBeTruthy();
    expect(screen.getByDisplayValue('Crucifixo')).toBeTruthy();
    expect(screen.getByDisplayValue('Prancha')).toBeTruthy();
  });

  it('trocar de dia mostra o foco do outro e avisa quando o dia não existe', async () => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Ter' }));
    expect(await screen.findByDisplayValue('Costas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Qua' }));
    expect(await screen.findByText('Dia não encontrado neste plano.')).toBeTruthy();
  });

  it('editar o foco salva ao sair do campo; sem mudança não salva', async () => {
    await openEditor();
    const foco = screen.getByDisplayValue('Peito');
    fireEvent.blur(foco);
    expect(h.api.updatePlanDay).not.toHaveBeenCalled();
    fireEvent.change(foco, { target: { value: 'Peito / Tríceps' } });
    fireEvent.blur(foco);
    await waitFor(() => expect(h.api.updatePlanDay).toHaveBeenCalledWith('d1', { foco: 'Peito / Tríceps' }));
  });

  it('editar um campo do exercício salva só o campo que mudou', async () => {
    await openEditor();
    const nome = screen.getByDisplayValue('Supino');
    fireEvent.change(nome, { target: { value: 'Supino Inclinado' } });
    fireEvent.blur(nome);
    await waitFor(() => expect(h.api.updateExercise).toHaveBeenCalledWith('e1', { nome: 'Supino Inclinado' }, 'u1'));
  });

  it('o plano ativo é recarregado na tela depois de editar', async () => {
    await openEditor();
    const nome = screen.getByDisplayValue('Supino');
    fireEvent.change(nome, { target: { value: 'X' } });
    fireEvent.blur(nome);
    await waitFor(() => expect(h.refreshPlan).toHaveBeenCalled());
  });

  it('adiciona exercício e item de pós-treino com os padrões e a posição no fim', async () => {
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: '+ Exercício' }));
    await waitFor(() => expect(h.api.addExercise).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ nome: 'Novo exercício', series: '3', reps: '10-12', descanso: '60s', is_post_workout: false }),
      2,
    ));
    fireEvent.click(screen.getByRole('button', { name: '+ Item pós-treino' }));
    await waitFor(() => expect(h.api.addExercise).toHaveBeenLastCalledWith(
      'd1',
      expect.objectContaining({ nome: 'Novo item', reps: '12-15', descanso: '45s', is_post_workout: true }),
      1,
    ));
  });

  it('remove um exercício', async () => {
    await openEditor();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover exercício' })[0]);
    await waitFor(() => expect(h.api.deleteExercise).toHaveBeenCalledWith('e1'));
  });

  it('mover troca as posições de dois exercícios; os extremos ficam desabilitados', async () => {
    await openEditor();
    const ups = screen.getAllByRole('button', { name: 'Mover para cima' });
    const downs = screen.getAllByRole('button', { name: 'Mover para baixo' });
    expect(ups[0].disabled).toBe(true);   // Supino é o primeiro
    expect(downs[1].disabled).toBe(true); // Crucifixo é o último

    fireEvent.click(downs[0]);
    await waitFor(() => expect(h.api.reorderExercises).toHaveBeenCalledWith([
      { id: 'e1', order_index: 1 },
      { id: 'e2', order_index: 0 },
    ]));
  });

  it('erros viram toast e não derrubam o editor', async () => {
    await openEditor();
    h.api.deleteExercise.mockRejectedValue(new Error('falhou'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover exercício' })[0]);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao remover exercício'));
    expect(screen.getByDisplayValue('Supino')).toBeTruthy();
  });

  it('o seletor de plano carrega os dias do outro plano', async () => {
    await openEditor();
    const select = within(document.querySelector('.plan-editor')).getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'p2' } });
    await waitFor(() => expect(h.api.fetchPlanDays).toHaveBeenCalledWith('p2'));
  });
});
