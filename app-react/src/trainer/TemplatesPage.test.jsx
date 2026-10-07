// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {}, sendMessage: vi.fn(), builder: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../components/Loading', () => ({ default: () => <div data-testid="loading" /> }));
vi.mock('../lib/trainer', () => ({ fetchClients: (...a) => h.api.fetchClients(...a) }));
vi.mock('../lib/trainerMessages', () => ({ sendMessage: (...a) => h.sendMessage(...a) }));
vi.mock('../lib/trainerTemplates', async (importActual) => ({
  ...(await importActual()),
  fetchTemplates: (...a) => h.api.fetchTemplates(...a),
  deleteTemplate: (...a) => h.api.deleteTemplate(...a),
  assignPlanBulk: (...a) => h.api.assignPlanBulk(...a),
}));
vi.mock('./PlanBuilder', () => ({
  default: (props) => {
    h.builder(props);
    return (
      <div data-testid="builder">
        <button type="button" onClick={props.onBack}>voltar do builder</button>
        <button type="button" onClick={props.onSent}>enviado</button>
      </div>
    );
  },
}));

import TemplatesPage from './TemplatesPage';

const TPL = {
  id: 't1', name: 'Hipertrofia A', weeks: 8, at: '2026-10-01',
  days: [{ dia: 'Segunda', foco: 'Peito', exercicios: [{ nome: 'Supino', series: '3', reps: '10', descanso: '60s', tecnica: '' }] }],
};
const CLIENTS = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bruno' }];

beforeEach(() => {
  h.toast.mockReset();
  h.builder.mockReset();
  h.sendMessage.mockReset().mockResolvedValue(2);
  h.api = {
    fetchClients: vi.fn().mockResolvedValue(CLIENTS),
    fetchTemplates: vi.fn().mockResolvedValue([TPL]),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    assignPlanBulk: vi.fn().mockResolvedValue(['a', 'b']),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function setup() {
  render(<TemplatesPage />);
  await screen.findByText('Hipertrofia A');
}

describe('TemplatesPage', () => {
  it('lista os modelos com o resumo', async () => {
    await setup();
    expect(screen.getByText(/1 dia\(s\) · 1 exercício\(s\)/)).toBeTruthy();
  });

  it('sem modelos mostra a orientação; falha ao carregar também', async () => {
    h.api.fetchTemplates.mockResolvedValue([]);
    render(<TemplatesPage />);
    expect(await screen.findByText(/Nenhum modelo ainda/)).toBeTruthy();
    cleanup();
    h.api.fetchTemplates.mockRejectedValue(new Error('x'));
    render(<TemplatesPage />);
    expect(await screen.findByText(/Nenhum modelo ainda/)).toBeTruthy();
  });

  it('+ Novo modelo abre o editor em branco; voltar e enviado fecham (enviado recarrega)', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '+ Novo modelo' }));
    expect(h.builder).toHaveBeenLastCalledWith(expect.objectContaining({ initialPlan: null }));
    fireEvent.click(screen.getByRole('button', { name: 'voltar do builder' }));
    expect(screen.queryByTestId('builder')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Novo modelo' }));
    fireEvent.click(screen.getByRole('button', { name: 'enviado' }));
    await waitFor(() => expect(h.api.fetchTemplates).toHaveBeenCalledTimes(2));
  });

  it('Editar como novo abre o editor com o plano do modelo', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Editar como novo' }));
    expect(h.builder).toHaveBeenLastCalledWith(expect.objectContaining({
      initialPlan: expect.objectContaining({ name: 'Hipertrofia A', duration_weeks: 8 }),
    }));
  });

  it('apagar pede confirmação e recarrega', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(h.api.deleteTemplate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(h.api.deleteTemplate).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(h.api.fetchTemplates).toHaveBeenCalledTimes(2));
  });

  it('erro ao apagar avisa', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.deleteTemplate.mockRejectedValue(new Error('x'));
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível apagar'));
  });

  it('sem alunos o botão de enviar fica desabilitado', async () => {
    h.api.fetchClients.mockResolvedValue([]);
    await setup();
    await waitFor(() => expect(h.api.fetchClients).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '📤 Enviar a alunos' }).disabled).toBe(true);
  });

  it('enviar a alunos: escolhe quem recebe, confirma, envia e avisa por recado', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await setup();
    await waitFor(() => expect(screen.getByRole('button', { name: '📤 Enviar a alunos' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar a alunos' }));

    // sem ninguém escolhido o envio fica desabilitado
    expect(screen.getByRole('button', { name: 'Enviar para 0 aluno(s)' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByRole('button', { name: 'Enviar para 2 aluno(s)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bruno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para 1 aluno(s)' }));

    await waitFor(() => expect(h.api.assignPlanBulk).toHaveBeenCalledWith(['a'], expect.objectContaining({ ok: true, name: 'Hipertrofia A' })));
    expect(h.sendMessage).toHaveBeenCalledWith(['a', 'b'], expect.stringContaining('Hipertrofia A'), 'treino');
    expect(h.toast).toHaveBeenCalledWith('✅ Treino enviado para 2 aluno(s)');
  });

  it('recusar a confirmação não envia', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await setup();
    await waitFor(() => expect(screen.getByRole('button', { name: '📤 Enviar a alunos' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar a alunos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para 1 aluno(s)' }));
    expect(h.api.assignPlanBulk).not.toHaveBeenCalled();
  });

  it('erro do servidor aparece na própria área de envio', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.assignPlanBulk.mockRejectedValue(new Error('not_authorized'));
    await setup();
    await waitFor(() => expect(screen.getByRole('button', { name: '📤 Enviar a alunos' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '📤 Enviar a alunos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para 1 aluno(s)' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});
