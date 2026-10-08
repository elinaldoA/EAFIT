// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('../lib/challenges', async (importActual) => ({
  ...(await importActual()),
  fetchMyChallenges: (...a) => h.api.fetchMyChallenges(...a),
  createChallenge: (...a) => h.api.createChallenge(...a),
  joinChallenge: (...a) => h.api.joinChallenge(...a),
  leaveChallenge: (...a) => h.api.leaveChallenge(...a),
  fetchLeaderboard: (...a) => h.api.fetchLeaderboard(...a),
  fetchOfficialChallenges: (...a) => h.api.fetchOfficialChallenges(...a),
}));

import Challenges, { Leaderboard } from './Challenges';

const ACTIVE = { id: 'c1', title: 'Outubro firme', invite_code: 'ABC123', start_date: '2026-10-05', end_date: '2026-10-12', members: 4, score: 3, rank: 2 };
const ENDED = { id: 'c2', title: 'Setembro', invite_code: 'OLD999', start_date: '2026-09-01', end_date: '2026-09-07', members: 2, score: 5, rank: 1 };
const FUTURE = { id: 'c3', title: 'Novembro', invite_code: 'NEW111', start_date: '2026-11-01', end_date: '2026-11-07', members: 1, score: 0, rank: 1 };

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchMyChallenges: vi.fn().mockResolvedValue([ACTIVE]),
    createChallenge: vi.fn().mockResolvedValue(undefined),
    joinChallenge: vi.fn().mockResolvedValue(undefined),
    leaveChallenge: vi.fn().mockResolvedValue(undefined),
    fetchOfficialChallenges: vi.fn().mockResolvedValue([]),
    fetchLeaderboard: vi.fn().mockResolvedValue([
      { rank: 1, name: 'Carol', score: 5, isMe: false },
      { rank: 2, name: 'Ana', score: 3, isMe: true },
    ]),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.share;
});

async function setup() {
  render(<Challenges />);
  await screen.findByText('🏆 Desafios com amigos');
}

describe('Challenges — lista', () => {
  it('lista o desafio oficial aberto e entra com um toque', async () => {
    h.api.fetchOfficialChallenges.mockResolvedValue([
      { id: 'o1', title: 'Outubro EAFIT', invite_code: 'OFI001', start_date: '2026-10-01', end_date: '2026-10-31', members: 40 },
    ]);
    await setup();
    expect(screen.getByText('⭐ Outubro EAFIT')).toBeTruthy();
    expect(screen.getByText(/Desafio oficial do EAFIT/).textContent).toMatch(/24 dia\(s\) restantes · 40 pessoa\(s\)/);
    fireEvent.click(screen.getByText('Participar'));
    await waitFor(() => expect(h.api.joinChallenge).toHaveBeenCalledWith('OFI001'));
    expect(h.toast).toHaveBeenCalledWith('🎉 Você entrou no desafio!');
  });

  it('sem os oficiais (consulta falhou), a lista segue normal', async () => {
    h.api.fetchOfficialChallenges.mockRejectedValue(new Error('função não existe'));
    await setup();
    expect(screen.getByRole('button', { name: /Outubro firme/ })).toBeTruthy();
    expect(screen.queryByText('Participar')).toBeNull();
  });

  it('mostra título, dias restantes, pessoas e a minha posição', async () => {
    await setup();
    const head = screen.getByRole('button', { name: /Outubro firme/ });
    expect(head.textContent).toMatch(/5 dia\(s\) restantes/);
    expect(head.textContent).toMatch(/4 pessoa\(s\)/);
    expect(head.textContent).toMatch(/você em 2º \(3\)/);
  });

  it('estados: encerrado, ainda não começou e último dia', async () => {
    h.api.fetchMyChallenges.mockResolvedValue([ENDED, FUTURE, { ...ACTIVE, id: 'c4', title: 'Hoje acaba', end_date: '2026-10-07' }]);
    await setup();
    expect(screen.getByRole('button', { name: /Setembro/ }).textContent).toMatch(/Encerrado/);
    expect(screen.getByRole('button', { name: /Novembro/ }).textContent).toMatch(/Ainda não começou/);
    expect(screen.getByRole('button', { name: /Hoje acaba/ }).textContent).toMatch(/Último dia/);
  });

  it('desafio criado pelo personal (sem posição) mostra "coach"', async () => {
    h.api.fetchMyChallenges.mockResolvedValue([{ ...ACTIVE, rank: null, score: null }]);
    await setup();
    expect(screen.getByRole('button', { name: /Outubro firme/ }).textContent).toMatch(/você é o coach/);
  });

  it('sem desafios mostra a dica; falha ao carregar também cai no vazio', async () => {
    h.api.fetchMyChallenges.mockResolvedValue([]);
    await setup();
    expect(screen.getByText(/Crie um desafio e mande o código/)).toBeTruthy();
    cleanup();
    h.api.fetchMyChallenges.mockRejectedValue(new Error('rede'));
    await setup();
    expect(screen.getByText(/Crie um desafio e mande o código/)).toBeTruthy();
  });

  it('abrir mostra o placar com a minha linha destacada', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: /Outubro firme/ }));
    expect(await screen.findByText(/1º Carol/)).toBeTruthy();
    expect(screen.getByText(/2º Ana\(você\)/)).toBeTruthy();
    expect(h.api.fetchLeaderboard).toHaveBeenCalledWith('c1');
  });
});

describe('Challenges — criar e entrar', () => {
  it('criar valida o nome e cria com o período a partir de hoje', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '+ Criar desafio' }));
    fireEvent.change(screen.getByLabelText('Nome do desafio'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar desafio' }));
    expect(screen.getByRole('alert').textContent).toMatch(/pelo menos 3 letras/);
    expect(h.api.createChallenge).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nome do desafio'), { target: { value: ' Treino da firma ' } });
    fireEvent.change(screen.getByLabelText('Duração'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar desafio' }));
    await waitFor(() => expect(h.api.createChallenge).toHaveBeenCalledWith('Treino da firma', '2026-10-07', '2026-10-20'));
    expect(h.toast).toHaveBeenCalledWith('🏁 Desafio criado! Compartilhe o código.');
    expect(h.api.fetchMyChallenges).toHaveBeenCalledTimes(2);
  });

  it('entrar com código normaliza, entra e avisa; código curto não chama o servidor', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com código' }));
    const input = screen.getByLabelText('Código do convite');
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByRole('alert').textContent).toBe('Digite o código do convite.');

    fireEvent.change(input, { target: { value: ' abc-123 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(h.api.joinChallenge).toHaveBeenCalledWith('ABC123'));
    expect(h.toast).toHaveBeenCalledWith('🎉 Você entrou no desafio!');
  });

  it('erro do servidor aparece como mensagem amigável', async () => {
    h.api.joinChallenge.mockRejectedValue(new Error('challenge_full'));
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com código' }));
    fireEvent.change(screen.getByLabelText('Código do convite'), { target: { value: 'ZZZZ99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/20 participantes/));
  });

  it('alternar os formulários troca um pelo outro', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '+ Criar desafio' }));
    expect(screen.getByLabelText('Nome do desafio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com código' }));
    expect(screen.queryByLabelText('Nome do desafio')).toBeNull();
    expect(screen.getByLabelText('Código do convite')).toBeTruthy();
  });
});

describe('Challenges — convidar e sair', () => {
  it('convidar usa o compartilhamento nativo; encerrado não oferece convite', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    h.api.fetchMyChallenges.mockResolvedValue([ACTIVE, ENDED]);
    await setup();
    fireEvent.click(screen.getByRole('button', { name: /Outubro firme/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Convidar · ABC123/ }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Outubro firme', text: expect.stringContaining('ABC123') })));

    fireEvent.click(screen.getByRole('button', { name: /Setembro/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Convidar · OLD999/ })).toBeNull());
  });

  it('sem compartilhamento nativo copia o convite', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await setup();
    fireEvent.click(screen.getByRole('button', { name: /Outubro firme/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Convidar/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(h.toast).toHaveBeenCalledWith('📋 Convite copiado');
  });

  it('sair pede confirmação, sai e fecha o painel', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await setup();
    fireEvent.click(screen.getByRole('button', { name: /Outubro firme/ }));
    const leave = await screen.findByRole('button', { name: 'Sair' });
    fireEvent.click(leave);
    expect(h.api.leaveChallenge).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(leave);
    await waitFor(() => expect(h.api.leaveChallenge).toHaveBeenCalledWith('c1'));
    expect(h.toast).toHaveBeenCalledWith('Você saiu do desafio');
  });

  it('falha ao sair avisa', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.leaveChallenge.mockRejectedValue(new Error('x'));
    await setup();
    fireEvent.click(screen.getByRole('button', { name: /Outubro firme/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível sair'));
  });
});

describe('Leaderboard', () => {
  it('falha ao buscar o placar mostra lista vazia em vez de carregar para sempre', async () => {
    h.api.fetchLeaderboard.mockRejectedValue(new Error('x'));
    const { container } = render(<Leaderboard id="c1" />);
    await waitFor(() => expect(container.querySelector('ol')).not.toBeNull());
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});
