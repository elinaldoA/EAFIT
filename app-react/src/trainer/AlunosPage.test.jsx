// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));
vi.mock('./ClientDetail', () => ({
  default: ({ client, onBack, onRemoved }) => (
    <div data-testid="detail">
      <span>ficha {client.name}</span>
      <button type="button" onClick={onBack}>voltar</button>
      <button type="button" onClick={onRemoved}>removido</button>
    </div>
  ),
}));
vi.mock('../lib/trainer', async (importActual) => ({
  ...(await importActual()),
  fetchClients: (...a) => h.api.fetchClients(...a),
  fetchTrainerCode: (...a) => h.api.fetchTrainerCode(...a),
}));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  fetchUnreadReplies: (...a) => h.api.fetchUnreadReplies(...a),
}));
vi.mock('../lib/trainerAppointments', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerAppointments: (...a) => h.api.fetchTrainerAppointments(...a),
}));

import AlunosPage from './AlunosPage';

const CLIENTS = [
  { id: 'c1', name: 'Ana', last_day: '2026-10-07', days7: 5, days30: 19, paused: false },
  { id: 'c2', name: 'Bruno', last_day: '2026-10-01', days7: 1, days30: 8, paused: false },
  { id: 'c3', name: 'Rafa', last_day: '2026-09-28', days7: 0, days30: 3, paused: false },
];

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchClients: vi.fn().mockResolvedValue(CLIENTS),
    fetchTrainerCode: vi.fn().mockResolvedValue('P7K2QX'),
    fetchUnreadReplies: vi.fn().mockResolvedValue({}),
    fetchTrainerAppointments: vi.fn().mockResolvedValue([]),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.share;
});

const names = () => screen.getAllByRole('button').filter(b => b.className.includes('client-row')).map(b => b.querySelector('strong').textContent);

describe('AlunosPage', () => {
  it('mostra o código de convite e enquanto carrega, o esqueleto', async () => {
    h.api.fetchClients.mockReturnValue(new Promise(() => {}));
    render(<AlunosPage />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    expect(await screen.findByText('P7K2QX')).toBeTruthy();
  });

  it('lista os alunos com quem precisa de atenção primeiro', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    expect(names()).toEqual(['Rafa', 'Bruno', 'Ana']);
    expect(screen.getByText('Sumido há 9 dias')).toBeTruthy();
    expect(screen.getByText('Parado há 6 dias')).toBeTruthy();
    expect(screen.getByText('Treinou hoje')).toBeTruthy();
  });

  it('resumo da semana e contagem de quem precisa de atenção', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    expect(screen.getByText('2/3')).toBeTruthy(); // treinaram na semana
    expect(screen.getByText('6')).toBeTruthy();   // treinos no total
    const summary = screen.getByText('precisam de atenção').parentElement;
    expect(summary.textContent).toContain('2');
  });

  it('avisa o shell quantos alunos precisam de atenção', async () => {
    const onClientsLoaded = vi.fn();
    render(<AlunosPage onClientsLoaded={onClientsLoaded} />);
    await waitFor(() => expect(onClientsLoaded).toHaveBeenCalledWith(2));
  });

  it('filtros: precisam de atenção e em dia', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Precisam de atenção' }));
    expect(names()).toEqual(['Rafa', 'Bruno']);
    fireEvent.click(screen.getByRole('button', { name: 'Em dia' }));
    expect(names()).toEqual(['Ana']);
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(names()).toHaveLength(3);
  });

  it('filtro sem resultado avisa', async () => {
    h.api.fetchClients.mockResolvedValue([CLIENTS[0]]);
    render(<AlunosPage />);
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Precisam de atenção' }));
    expect(screen.getByText('Nenhum aluno neste filtro.')).toBeTruthy();
  });

  it('sem alunos mostra a orientação para compartilhar o código', async () => {
    h.api.fetchClients.mockResolvedValue([]);
    render(<AlunosPage />);
    expect(await screen.findByText(/Nenhum aluno vinculado ainda/)).toBeTruthy();
  });

  it('falha ao carregar os alunos cai na lista vazia', async () => {
    h.api.fetchClients.mockRejectedValue(new Error('rede'));
    render(<AlunosPage />);
    expect(await screen.findByText(/Nenhum aluno vinculado ainda/)).toBeTruthy();
  });

  it('mostra respostas novas dos alunos', async () => {
    h.api.fetchUnreadReplies.mockResolvedValue({ c2: 2 });
    render(<AlunosPage />);
    expect(await screen.findByText(/2 resposta\(s\) nova\(s\)/)).toBeTruthy();
  });

  it('mostra as próximas aulas com o status', async () => {
    h.api.fetchTrainerAppointments.mockResolvedValue([
      { id: 'a1', name: 'Ana', starts: new Date(Date.now() + 86400000).toISOString(), status: 'confirmed' },
      { id: 'a2', name: 'Bruno', starts: new Date(Date.now() + 2 * 86400000).toISOString(), status: 'pending' },
    ]);
    render(<AlunosPage />);
    expect(await screen.findByText('Confirmada')).toBeTruthy();
    expect(screen.getByText('Aguardando')).toBeTruthy();
    expect(screen.getByText('📅 Próximas aulas')).toBeTruthy();
  });

  it('migration de aulas pendente não derruba a tela', async () => {
    h.api.fetchTrainerAppointments.mockRejectedValue(new Error('relation does not exist'));
    render(<AlunosPage />);
    expect(await screen.findByText('Ana')).toBeTruthy();
  });

  it('convidar usa o compartilhamento nativo com o código', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    render(<AlunosPage />);
    await screen.findByText('P7K2QX');
    fireEvent.click(screen.getByRole('button', { name: '📤 Convidar aluno' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('P7K2QX') })));
  });

  it('sem compartilhamento nativo copia o convite', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<AlunosPage />);
    await screen.findByText('P7K2QX');
    fireEvent.click(screen.getByRole('button', { name: '📤 Convidar aluno' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(h.toast).toHaveBeenCalledWith('📋 Convite copiado');
  });

  it('abrir um aluno mostra a ficha; voltar recarrega a lista', async () => {
    render(<AlunosPage />);
    fireEvent.click(await screen.findByText('Ana'));
    expect(screen.getByText('ficha Ana')).toBeTruthy();
    expect(h.api.fetchClients).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'voltar' }));
    await screen.findByText('Bruno');
    expect(h.api.fetchClients).toHaveBeenCalledTimes(2);
  });

  it('aluno removido na ficha também volta à lista recarregada', async () => {
    render(<AlunosPage />);
    fireEvent.click(await screen.findByText('Ana'));
    fireEvent.click(screen.getByRole('button', { name: 'removido' }));
    await waitFor(() => expect(h.api.fetchClients).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('detail')).toBeNull();
  });
});
