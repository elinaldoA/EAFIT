// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {}, sendMessage: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../components/Loading', () => ({ default: () => <div data-testid="loading" /> }));
vi.mock('../lib/trainerMessages', () => ({ sendMessage: (...a) => h.sendMessage(...a) }));
vi.mock('../lib/exerciseSwap', () => ({ fetchLibrary: (...a) => h.api.fetchLibrary(...a) }));
vi.mock('../lib/trainerTemplates', async (importActual) => ({
  ...(await importActual()),
  fetchTemplates: (...a) => h.api.fetchTemplates(...a),
  saveTemplate: (...a) => h.api.saveTemplate(...a),
  updateTemplate: (...a) => h.api.updateTemplate(...a),
}));
vi.mock('../lib/trainerPlan', async (importActual) => ({
  ...(await importActual()),
  fetchClientPlan: (...a) => h.api.fetchClientPlan(...a),
  assignPlan: (...a) => h.api.assignPlan(...a),
}));

import PlanBuilder from './PlanBuilder';

const LIB = [
  { nome: 'Supino Reto com Barra', grupo_muscular: 'Peito', series: '4', reps: '8-10', descanso: '90s', tecnica: 'Controle', is_post_workout: false },
  { nome: 'Prancha', series: '3', reps: '30s', descanso: '30s', tecnica: '', is_post_workout: true },
];
const CLIENT = { id: 'c1', name: 'Ana' };
const PLAN = {
  name: 'Hipertrofia', duration_weeks: 8,
  days: [{ dia: 'Segunda', foco: 'Peito', exercicios: [{ nome: 'Supino', series: '3', reps: '10', descanso: '60s', tecnica: '' }] }],
};

beforeEach(() => {
  h.toast.mockReset();
  h.sendMessage.mockReset().mockResolvedValue(1);
  h.api = {
    fetchLibrary: vi.fn().mockResolvedValue(LIB),
    fetchTemplates: vi.fn().mockResolvedValue([]),
    saveTemplate: vi.fn().mockResolvedValue(undefined),
    updateTemplate: vi.fn().mockResolvedValue(undefined),
    fetchClientPlan: vi.fn().mockResolvedValue(PLAN),
    assignPlan: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const setup = (props = {}) => {
  const fns = { onBack: vi.fn(), onSent: vi.fn() };
  render(<PlanBuilder {...fns} {...props} />);
  return fns;
};

describe('PlanBuilder — com aluno', () => {
  it('abre com o plano atual do aluno', async () => {
    setup({ client: CLIENT });
    expect((await screen.findByLabelText('Nome do plano')).value).toBe('Hipertrofia');
    expect(screen.getByLabelText('Duração').value).toBe('8');
    expect(screen.getByDisplayValue('Peito')).toBeTruthy();
    expect(screen.getByDisplayValue('Supino')).toBeTruthy();
    expect(h.api.fetchClientPlan).toHaveBeenCalledWith('c1');
  });

  it('aluno sem plano abre em branco; falha ao buscar também', async () => {
    h.api.fetchClientPlan.mockResolvedValue(null);
    setup({ client: CLIENT });
    expect((await screen.findByLabelText('Nome do plano')).value).toBe('');
    cleanup();
    h.api.fetchClientPlan.mockRejectedValue(new Error('x'));
    setup({ client: CLIENT });
    expect((await screen.findByLabelText('Nome do plano')).value).toBe('');
  });

  it('enviar valida, confirma, envia o plano, avisa por recado e fecha', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onSent } = setup({ client: CLIENT });
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar treino para o aluno' }));
    await waitFor(() => expect(h.api.assignPlan).toHaveBeenCalledWith('c1', expect.objectContaining({
      ok: true, name: 'Hipertrofia', weeks: 8,
      days: [expect.objectContaining({ dia: 'Segunda', foco: 'Peito' })],
    })));
    expect(h.sendMessage).toHaveBeenCalledWith(['c1'], expect.stringContaining('Hipertrofia'), 'treino');
    expect(h.toast).toHaveBeenCalledWith('✅ Treino enviado para o aluno');
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('recusar a confirmação não envia', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup({ client: CLIENT });
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar treino para o aluno' }));
    expect(h.api.assignPlan).not.toHaveBeenCalled();
  });

  it('plano inválido mostra o erro e não envia', async () => {
    h.api.fetchClientPlan.mockResolvedValue(null);
    setup({ client: CLIENT });
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar treino para o aluno' }));
    expect(screen.getByRole('alert').textContent).toBe('Dê um nome ao plano.');
    fireEvent.change(screen.getByLabelText('Nome do plano'), { target: { value: 'Teste' } });
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar treino para o aluno' }));
    expect(screen.getByRole('alert').textContent).toBe('Marque pelo menos um dia de treino.');
    expect(h.api.assignPlan).not.toHaveBeenCalled();
  });

  it('erro do servidor aparece e mantém o rascunho', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.assignPlan.mockRejectedValue(new Error('not_authorized'));
    const { onSent } = setup({ client: CLIENT });
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar treino para o aluno' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/vínculo ativo/));
    expect(onSent).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome do plano').value).toBe('Hipertrofia');
  });

  it('salvar como modelo mantém na ficha e recarrega os modelos', async () => {
    const { onSent } = setup({ client: CLIENT });
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: '💾 Salvar como modelo' }));
    await waitFor(() => expect(h.api.saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hipertrofia' })));
    expect(h.toast).toHaveBeenCalledWith('💾 Modelo salvo');
    expect(onSent).not.toHaveBeenCalled();
    await waitFor(() => expect(h.api.fetchTemplates).toHaveBeenCalledTimes(2));
  });

  it('voltar leva de volta à ficha', async () => {
    const { onBack } = setup({ client: CLIENT });
    fireEvent.click(await screen.findByRole('button', { name: '‹ Voltar à ficha' }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('PlanBuilder — modelo (sem aluno)', () => {
  it('abre em branco, sem botão de enviar ao aluno', async () => {
    setup();
    expect((await screen.findByLabelText('Nome do plano')).value).toBe('');
    expect(screen.queryByRole('button', { name: /Enviar treino para o aluno/ })).toBeNull();
    expect(screen.getByRole('button', { name: '‹ Voltar aos modelos' })).toBeTruthy();
  });

  it('abre a partir de um plano inicial', async () => {
    setup({ initialPlan: PLAN });
    expect((await screen.findByLabelText('Nome do plano')).value).toBe('Hipertrofia');
  });

  it('marcar dias cria os cartões em ordem da semana; desmarcar remove', async () => {
    setup();
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: 'Qua' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seg' }));
    const dayTitles = () => [...document.querySelectorAll('.dash-card__title')].map(e => e.textContent.split(' ·')[0]);
    const titles = dayTitles().filter(t => ['Segunda', 'Quarta'].includes(t));
    expect(titles).toEqual(['Segunda', 'Quarta']);
    fireEvent.click(screen.getByRole('button', { name: 'Qua' }));
    expect(dayTitles()).not.toContain('Quarta');
  });

  it('escolher um exercício da biblioteca preenche séries, reps, descanso e técnica', async () => {
    setup();
    await screen.findByLabelText('Nome do plano');
    await waitFor(() => expect(h.api.fetchLibrary).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Seg' }));
    fireEvent.change(screen.getByPlaceholderText('Exercício'), { target: { value: 'supino reto com barra' } });
    await waitFor(() => expect(screen.getByDisplayValue('4')).toBeTruthy());
    expect(screen.getByDisplayValue('8-10')).toBeTruthy();
    expect(screen.getByDisplayValue('90s')).toBeTruthy();
    expect(screen.getByDisplayValue('Controle')).toBeTruthy();
  });

  it('nome fora da biblioteca só troca o nome e mantém os padrões', async () => {
    setup();
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: 'Seg' }));
    fireEvent.change(screen.getByPlaceholderText('Exercício'), { target: { value: 'Exercício meu' } });
    expect(screen.getByDisplayValue('Exercício meu')).toBeTruthy();
    expect(screen.getByDisplayValue('10-12')).toBeTruthy();
  });

  it('adiciona, move e remove exercícios', async () => {
    setup({ initialPlan: PLAN });
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: '+ Exercício' }));
    expect(screen.getAllByPlaceholderText('Exercício')).toHaveLength(2);

    fireEvent.change(screen.getAllByPlaceholderText('Exercício')[1], { target: { value: 'Crucifixo' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Subir' })[1]);
    expect(screen.getAllByPlaceholderText('Exercício')[0].value).toBe('Crucifixo');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remover exercício' })[0]);
    expect(screen.getAllByPlaceholderText('Exercício')).toHaveLength(1);
    expect(screen.getByDisplayValue('Supino')).toBeTruthy();
  });

  it('o limite de 20 exercícios por dia desabilita o botão de adicionar', async () => {
    const many = { ...PLAN, days: [{ dia: 'Segunda', foco: '', exercicios: Array.from({ length: 20 }, (_, i) => ({ nome: `Ex ${i}`, series: '3', reps: '10', descanso: '60s', tecnica: '' })) }] };
    setup({ initialPlan: many });
    await screen.findByLabelText('Nome do plano');
    expect(screen.getByRole('button', { name: '+ Exercício' }).disabled).toBe(true);
  });

  it('salvar modelo sem aluno grava e fecha', async () => {
    const { onSent } = setup({ initialPlan: PLAN });
    await screen.findByLabelText('Nome do plano');
    fireEvent.click(screen.getByRole('button', { name: '💾 Salvar modelo' }));
    await waitFor(() => expect(h.api.saveTemplate).toHaveBeenCalled());
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });

  it('carregar um modelo pede confirmação quando já há dias montados', async () => {
    h.api.fetchTemplates.mockResolvedValue([{ id: 't1', name: 'Modelo A', weeks: 4, days: [{ dia: 'Terça', foco: 'Costas', exercicios: [{ nome: 'Remada', series: '3', reps: '10', descanso: '60s', tecnica: '' }] }] }]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup({ initialPlan: PLAN });
    const select = await screen.findByLabelText('Começar de um modelo');
    fireEvent.change(select, { target: { value: 't1' } });
    expect(screen.getByDisplayValue('Supino')).toBeTruthy();
    expect(confirm).toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.change(select, { target: { value: 't1' } });
    await waitFor(() => expect(screen.getByDisplayValue('Remada')).toBeTruthy());
    expect(screen.getByLabelText('Duração').value).toBe('4');
  });
});

describe('PlanBuilder — ferramentas de montagem', () => {
  it('copiar um dia para outro cria o dia com o mesmo foco e exercícios', async () => {
    setup({ client: CLIENT });
    await screen.findByDisplayValue('Peito');
    fireEvent.change(screen.getByLabelText('Copiar Segunda para'), { target: { value: 'Quinta' } });
    expect(screen.getAllByDisplayValue('Peito')).toHaveLength(2);
    expect(screen.getAllByDisplayValue('Supino')).toHaveLength(2);
    expect(screen.getByLabelText('Copiar Quinta para')).toBeTruthy();
  });

  it('duplicar exercício insere a cópia logo abaixo', async () => {
    setup({ client: CLIENT });
    await screen.findByDisplayValue('Supino');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar exercício' }));
    expect(screen.getAllByDisplayValue('Supino')).toHaveLength(2);
  });

  it('título do dia soma exercícios e séries; volume por grupo usa a biblioteca', async () => {
    h.api.fetchClientPlan.mockResolvedValue({
      ...PLAN,
      days: [{ dia: 'Segunda', foco: 'Peito', exercicios: [
        { nome: 'Supino Reto com Barra', series: '4', reps: '10' },
        { nome: 'Exercício livre', series: '3', reps: '12' },
      ] }],
    });
    setup({ client: CLIENT });
    await screen.findByDisplayValue('Supino Reto com Barra');
    expect(screen.getByText('· 2 exercício(s), 7 série(s)')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('📊 Volume da semana (séries por grupo)')).toBeTruthy());
    await waitFor(() => {
      const rows = [...document.querySelectorAll('.volume-list li')].map(li => li.textContent);
      expect(rows).toEqual(['Peito4', 'Outros3']);
    });
  });

  it('editando um modelo existente, salvar atualiza em vez de criar', async () => {
    const { onSent } = setup({ initialPlan: PLAN, templateId: 't9' });
    await screen.findByDisplayValue('Peito');
    expect(screen.getByText('🧩 Editar modelo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '💾 Salvar alterações' }));
    await waitFor(() => expect(h.api.updateTemplate).toHaveBeenCalledWith('t9', expect.objectContaining({ name: 'Hipertrofia' })));
    expect(h.api.saveTemplate).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('💾 Modelo atualizado');
    expect(onSent).toHaveBeenCalled();
  });
});
