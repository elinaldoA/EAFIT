// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {}, sendMessage: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('../components/Challenges', () => ({ Leaderboard: ({ id }) => <div data-testid="board">{id}</div> }));
vi.mock('../lib/trainer', () => ({ fetchClients: (...a) => h.api.fetchClients(...a) }));
vi.mock('../lib/trainerMessages', () => ({ sendMessage: (...a) => h.sendMessage(...a) }));
vi.mock('../lib/challenges', async (importActual) => ({
  ...(await importActual()),
  fetchMyChallenges: (...a) => h.api.fetchMyChallenges(...a),
  createClassChallenge: (...a) => h.api.createClassChallenge(...a),
  deleteClassChallenge: (...a) => h.api.deleteClassChallenge(...a),
}));

import ClassPage from './ClassPage';

const CHALLENGE = { id: 'c1', title: 'Outubro firme', invite_code: 'X', start_date: '2026-10-05', end_date: '2026-10-12', members: 12, score: null, rank: null };
const CLIENTS = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bruno' }];

beforeEach(() => {
  h.toast.mockReset();
  h.sendMessage.mockReset().mockResolvedValue(2);
  h.api = {
    fetchClients: vi.fn().mockResolvedValue(CLIENTS),
    fetchMyChallenges: vi.fn().mockResolvedValue([CHALLENGE]),
    createClassChallenge: vi.fn().mockResolvedValue(undefined),
    deleteClassChallenge: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function setup() {
  render(<ClassPage />);
  await screen.findByText('🏆 Desafios da turma');
}

describe('ClassPage', () => {
  it('lista os desafios com dias restantes e quantidade de alunos', async () => {
    await setup();
    const head = await screen.findByRole('button', { name: /Outubro firme/ });
    expect(head.textContent).toMatch(/5 dia\(s\) restantes/);
    expect(head.textContent).toMatch(/12 aluno\(s\)/);
  });

  it('sem desafios mostra a orientação', async () => {
    h.api.fetchMyChallenges.mockResolvedValue([]);
    await setup();
    expect(await screen.findByText(/Crie um desafio: todos os seus alunos entram/)).toBeTruthy();
  });

  it('abrir mostra o placar', async () => {
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: /Outubro firme/ }));
    expect(screen.getByTestId('board').textContent).toBe('c1');
  });

  it('sem alunos não dá para criar desafio', async () => {
    h.api.fetchClients.mockResolvedValue([]);
    await setup();
    await waitFor(() => expect(h.api.fetchClients).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '+ Novo desafio da turma' }).disabled).toBe(true);
  });

  it('valida o nome antes de criar', async () => {
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo desafio da turma' }));
    fireEvent.change(screen.getByLabelText('Nome do desafio'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e avisar alunos' }));
    expect(screen.getByRole('alert').textContent).toMatch(/pelo menos 3 letras/);
    expect(h.api.createClassChallenge).not.toHaveBeenCalled();
  });

  it('cria para todos os alunos (lista vazia), avisa por recado e recarrega', async () => {
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo desafio da turma' }));
    fireEvent.change(screen.getByLabelText('Nome do desafio'), { target: { value: 'Novembro forte' } });
    fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e avisar alunos' }));

    await waitFor(() => expect(h.api.createClassChallenge).toHaveBeenCalledWith('Novembro forte', '2026-10-07', '2026-10-13', []));
    expect(h.sendMessage).toHaveBeenCalledWith([], expect.stringContaining('Novembro forte'));
    expect(h.toast).toHaveBeenCalledWith('🏁 Desafio criado e alunos avisados');
    expect(h.api.fetchMyChallenges).toHaveBeenCalledTimes(2);
  });

  it('cria só para os alunos escolhidos', async () => {
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo desafio da turma' }));
    fireEvent.change(screen.getByLabelText('Nome do desafio'), { target: { value: 'Só os dois' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bruno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar e avisar alunos' }));
    await waitFor(() => expect(h.api.createClassChallenge).toHaveBeenCalledWith('Só os dois', '2026-10-07', '2026-10-20', ['a', 'b']));
  });

  it('falha ao avisar os alunos não desfaz a criação', async () => {
    h.sendMessage.mockRejectedValue(new Error('push'));
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo desafio da turma' }));
    fireEvent.change(screen.getByLabelText('Nome do desafio'), { target: { value: 'Mesmo assim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e avisar alunos' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('🏁 Desafio criado e alunos avisados'));
  });

  it('erro do servidor na criação aparece como mensagem', async () => {
    h.api.createClassChallenge.mockRejectedValue(new Error('no_recipients'));
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo desafio da turma' }));
    fireEvent.change(screen.getByLabelText('Nome do desafio'), { target: { value: 'Sem alunos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e avisar alunos' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Nenhum aluno vinculado/));
  });

  it('apagar pede confirmação, apaga e recarrega', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: /Outubro firme/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar desafio' }));
    expect(h.api.deleteClassChallenge).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar desafio' }));
    await waitFor(() => expect(h.api.deleteClassChallenge).toHaveBeenCalledWith('c1'));
    expect(h.toast).toHaveBeenCalledWith('Desafio apagado');
  });

  it('erro ao apagar avisa', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.deleteClassChallenge.mockRejectedValue(new Error('x'));
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: /Outubro firme/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar desafio' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível apagar'));
  });
});
