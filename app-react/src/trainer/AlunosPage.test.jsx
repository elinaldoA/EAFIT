// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {}, composer: vi.fn() }));

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
vi.mock('./MessageComposer', () => ({
  default: (props) => { h.composer(props); return <div data-testid="composer">{props.label}</div>; },
}));
vi.mock('../lib/trainer', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerCode: (...a) => h.api.fetchTrainerCode(...a),
}));
vi.mock('../lib/trainerRoster', async (importActual) => ({
  ...(await importActual()),
  fetchRoster: (...a) => h.api.fetchRoster(...a),
  setClientTags: (...a) => h.api.setClientTags(...a),
}));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  fetchUnreadReplies: (...a) => h.api.fetchUnreadReplies(...a),
}));

import AlunosPage from './AlunosPage';

const base = { paused: false, weeklyGoal: null, planName: null, planDays: null, planEnd: null, planByMe: false, pain7: 0, tags: [], recent: [] };
const ROSTER = [
  { ...base, id: 'c1', name: 'Ana', email: 'ana@x.com', last_day: '2026-10-07', days7: 3, days30: 19, weeklyGoal: 4, planName: 'Hipertrofia', planDays: 4, planEnd: '2026-12-01', tags: ['Online'], recent: ['2026-10-03', '2026-10-05', '2026-10-07'] },
  { ...base, id: 'c2', name: 'Bruno', email: 'bruno@x.com', last_day: '2026-10-01', days7: 1, days30: 8, planName: 'Força', planDays: 3, planEnd: '2026-10-10', tags: ['Presencial'] },
  { ...base, id: 'c3', name: 'Rafa', email: 'rafa@x.com', last_day: '2026-09-28', days7: 0, days30: 3, pain7: 1 },
];

beforeEach(() => {
  h.toast.mockReset();
  h.composer.mockReset();
  h.api = {
    fetchRoster: vi.fn().mockResolvedValue(ROSTER),
    fetchTrainerCode: vi.fn().mockResolvedValue('P7K2QX'),
    fetchUnreadReplies: vi.fn().mockResolvedValue({}),
    setClientTags: vi.fn().mockResolvedValue([]),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.share;
});

const names = () => [...document.querySelectorAll('.client-row strong')].filter(e => !e.className).map(e => e.textContent);
const chip = label => screen.getAllByRole('button').find(b => b.textContent.startsWith(label) && b.className.includes('recap__btn'));

describe('AlunosPage', () => {
  it('mostra o esqueleto enquanto carrega', () => {
    h.api.fetchRoster.mockReturnValue(new Promise(() => {}));
    render(<AlunosPage />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('lista os alunos com quem precisa de atenção primeiro', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    expect(names()).toEqual(['Rafa', 'Bruno', 'Ana']);
    expect(screen.getByText('Sumido há 9 dias')).toBeTruthy();
    expect(screen.getByText('Treinou hoje')).toBeTruthy();
    expect(screen.getByText('3 de 3 aluno(s)')).toBeTruthy();
  });

  it('avisa o shell quantos alunos precisam de atenção', async () => {
    const onClientsLoaded = vi.fn();
    render(<AlunosPage onClientsLoaded={onClientsLoaded} />);
    await waitFor(() => expect(onClientsLoaded).toHaveBeenCalledWith(2));
  });

  it('linha do aluno: meta da semana com aderência, plano, etiquetas, dor e últimos 14 dias', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    expect(screen.getByText(/3\/4 treinos na semana/)).toBeTruthy();
    expect(screen.getByText('· 75%')).toBeTruthy();
    expect(screen.getByText(/Hipertrofia · Vence em 55 dias/)).toBeTruthy();
    expect(screen.getByText(/Força · Vence em 3 dia\(s\)/)).toBeTruthy();
    expect(screen.getByText(/📋 Sem plano/)).toBeTruthy();
    expect(screen.getByText('🩹 Dor relatada')).toBeTruthy();
    const ana = screen.getByText('Ana').closest('.client-row');
    expect(ana.querySelectorAll('.strip__day')).toHaveLength(14);
    expect(ana.querySelectorAll('.strip__day--on')).toHaveLength(3);
  });

  it('filtros com contagem: atenção, em dia, plano vencendo e sem plano', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    expect(chip('Precisam de atenção').textContent).toContain('2');
    fireEvent.click(chip('Precisam de atenção'));
    expect(names()).toEqual(['Rafa', 'Bruno']);
    fireEvent.click(chip('Em dia'));
    expect(names()).toEqual(['Ana']);
    fireEvent.click(chip('Plano vencendo'));
    expect(names()).toEqual(['Bruno']);
    fireEvent.click(chip('Sem plano'));
    expect(names()).toEqual(['Rafa']);
    fireEvent.click(chip('Todos'));
    expect(names()).toHaveLength(3);
  });

  it('busca por nome, e-mail ou etiqueta, sem acento', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    const search = screen.getByLabelText('Buscar aluno');
    fireEvent.change(search, { target: { value: 'bru' } });
    expect(names()).toEqual(['Bruno']);
    fireEvent.change(search, { target: { value: 'online' } });
    expect(names()).toEqual(['Ana']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum aluno neste filtro.')).toBeTruthy();
  });

  it('filtra por etiqueta e ordena por nome', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: '🏷️ Presencial' }));
    expect(names()).toEqual(['Bruno']);
    fireEvent.click(screen.getByRole('button', { name: '🏷️ Presencial' }));
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'nome' } });
    expect(names()).toEqual(['Ana', 'Bruno', 'Rafa']);
  });

  it('mostra respostas novas dos alunos', async () => {
    h.api.fetchUnreadReplies.mockResolvedValue({ c2: 2 });
    render(<AlunosPage />);
    expect(await screen.findByText(/2 resposta\(s\) nova\(s\)/)).toBeTruthy();
  });

  it('servidor sem a versão nova avisa e esconde plano e últimos dias', async () => {
    h.api.fetchRoster.mockResolvedValue([{ ...ROSTER[0], legacy: true, planName: null, recent: [] }]);
    render(<AlunosPage />);
    await screen.findByText('Ana');
    expect(screen.getByText(/aparecem quando o servidor for atualizado/)).toBeTruthy();
    expect(document.querySelector('.strip')).toBeNull();
    expect(document.querySelector('.plan-chip')).toBeNull();
  });

  it('sem alunos mostra a orientação e o botão de convite compartilha o código', async () => {
    h.api.fetchRoster.mockResolvedValue([]);
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    render(<AlunosPage />);
    expect(await screen.findByText(/Nenhum aluno vinculado ainda/)).toBeTruthy();
    const btn = screen.getByRole('button', { name: '📤 Convidar aluno' });
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('P7K2QX') })));
  });

  it('falha ao carregar os alunos cai na lista vazia', async () => {
    h.api.fetchRoster.mockRejectedValue(new Error('rede'));
    render(<AlunosPage />);
    expect(await screen.findByText(/Nenhum aluno vinculado ainda/)).toBeTruthy();
  });

  it('abrir um aluno mostra a ficha; voltar recarrega a lista', async () => {
    render(<AlunosPage />);
    fireEvent.click(await screen.findByText('Ana'));
    expect(screen.getByText('ficha Ana')).toBeTruthy();
    expect(h.api.fetchRoster).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'voltar' }));
    await screen.findByText('Bruno');
    expect(h.api.fetchRoster).toHaveBeenCalledTimes(2);
  });

  it('aluno removido na ficha também volta à lista recarregada', async () => {
    render(<AlunosPage />);
    fireEvent.click(await screen.findByText('Ana'));
    fireEvent.click(screen.getByRole('button', { name: 'removido' }));
    await waitFor(() => expect(h.api.fetchRoster).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('detail')).toBeNull();
  });

  it('aluno vindo do Painel abre direto na ficha', async () => {
    const onClientOpened = vi.fn();
    render(<AlunosPage openClient={ROSTER[1]} onClientOpened={onClientOpened} />);
    expect(await screen.findByText('ficha Bruno')).toBeTruthy();
    expect(onClientOpened).toHaveBeenCalled();
  });

  it('seleção em lote: recado para os escolhidos', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(screen.getByText('Ana'));
    fireEvent.click(screen.getByText('Rafa'));
    expect(screen.queryByTestId('detail')).toBeNull();
    expect(screen.getByText('2 selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '💬 Recado' }));
    expect(h.composer).toHaveBeenLastCalledWith(expect.objectContaining({ clientIds: ['c1', 'c3'] }));
  });

  it('seleção em lote: etiqueta somada às que cada aluno já tem', async () => {
    render(<AlunosPage />);
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Todos da lista' }));
    fireEvent.click(screen.getByRole('button', { name: '🏷️ Etiqueta' }));
    fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: 'VIP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(h.api.setClientTags).toHaveBeenCalledTimes(3));
    expect(h.api.setClientTags).toHaveBeenCalledWith('c1', ['Online', 'VIP']);
    expect(h.api.setClientTags).toHaveBeenCalledWith('c3', ['VIP']);
    expect(h.toast).toHaveBeenCalledWith('🏷️ Etiqueta "VIP" aplicada');
    await waitFor(() => expect(h.api.fetchRoster).toHaveBeenCalledTimes(2));
  });
});
