// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, mockInvoke, mockDownload } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockFrom: vi.fn(), mockInvoke: vi.fn(), mockDownload: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom, functions: { invoke: mockInvoke } } }));
vi.mock('../lib/csv', async orig => ({ ...(await orig()), downloadCsv: mockDownload }));

import Engagement from './Engagement';
import PlanAnalytics from './PlanAnalytics';
import Feedback from './Feedback';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Engagement', () => {
  const atRisk = [
    { id: 'u1', apelido: 'Zé', email: 'ze@x.com', last_training: '2026-02-01', days_inactive: 30, trainings_total: 4, plan_end_date: '2026-04-01' },
    { id: 'u2', nome: 'Maria', sobrenome: 'Souza', email: 'm@x.com', last_training: null, days_inactive: null, trainings_total: 0, plan_end_date: null },
  ];
  const expiring = [
    { user_id: 'u3', email: 'a@x.com', plan_name: 'Plano A', end_date: '2026-03-01', days_left: -3, has_next: true },
    { user_id: 'u4', email: 'b@x.com', plan_name: 'Plano B', end_date: '2026-03-05', days_left: 0, has_next: false },
    { user_id: 'u5', email: 'c@x.com', plan_name: 'Plano C', end_date: '2026-03-09', days_left: 4, has_next: false },
  ];

  function mockData(a = atRisk, e = expiring) {
    mockRpc.mockImplementation(async name => ({ data: name === 'admin_at_risk_users' ? a : e, error: null }));
  }

  it('lista usuários em risco e conta quem nunca treinou', async () => {
    mockData();
    wrap(<Engagement />);
    expect(await screen.findByText('Zé')).toBeTruthy();
    expect(screen.getByText('Maria Souza')).toBeTruthy();
    expect(screen.getByText('nunca treinou')).toBeTruthy();
    expect(screen.getByRole('cell', { name: '30 dias' })).toBeTruthy();
    expect(screen.getByText('01/02/2026')).toBeTruthy();
    expect(screen.getByText('2 usuário(s) · 1 nunca treinaram.')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_at_risk_users', { inactive_days: 14, max_rows: 200 });
  });

  it('troca o critério de inatividade', async () => {
    mockData();
    wrap(<Engagement />);
    await screen.findByText('Zé');
    fireEvent.click(within(screen.getByRole('group', { name: 'Dias sem treinar' })).getByRole('button', { name: '30 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_at_risk_users', { inactive_days: 30, max_rows: 200 }));
  });

  it('exporta o CSV com o nome de exibição', async () => {
    mockData();
    wrap(<Engagement />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByText('Exportar CSV'));
    const [name, csv] = mockDownload.mock.calls[0];
    expect(name).toBe('usuarios_em_risco_14d.csv');
    expect(csv.split('\n')[0]).toBe('Nome,Email,UltimoTreino,DiasSemTreinar,TotalTreinos,FimDoPlano');
    expect(csv).toContain('Zé,ze@x.com,2026-02-01,30,4,2026-04-01');
  });

  it('mostra situação dos planos: vencido, hoje e em N dias', async () => {
    mockData();
    wrap(<Engagement />);
    expect(await screen.findByText('vencido há 3 dia(s)')).toBeTruthy();
    expect(screen.getByText('vence hoje')).toBeTruthy();
    expect(screen.getByText('em 4 dia(s)')).toBeTruthy();
    expect(screen.getByText('configurado')).toBeTruthy();
  });

  it('estados vazios', async () => {
    mockData([], []);
    wrap(<Engagement />);
    expect(await screen.findByText('Ninguém em risco nesse critério.')).toBeTruthy();
    expect(screen.getByText('Nenhum plano vencendo nesse prazo.')).toBeTruthy();
    expect(screen.getByText('Exportar CSV').disabled).toBe(true);
  });

  it('troca o prazo dos planos', async () => {
    mockData();
    wrap(<Engagement />);
    await screen.findByText('vence hoje');
    fireEvent.click(screen.getAllByRole('button', { name: '14 dias' })[1]);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_expiring_plans', { days_ahead: 14 }));
  });

  it('mostra erro de cada cartão', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('negado') });
    wrap(<Engagement />);
    expect((await screen.findAllByText('negado')).length).toBe(2);
  });
});

describe('PlanAnalytics', () => {
  const summary = {
    users_with_plan: 40, users_total: 50, users_without_plan: 10, expired_active: 3, expiring_7d: 5,
    chained_pct: 60, avg_cycle_weeks: 8,
  };
  const breakdown = [
    { dimension: 'meta', value: 'massa', users: 10, with_plan: 9, trained_30d: 8, never_trained: 1, sessions_per_week: 3, adherence_pct: 80, pain_users: 2 },
    { dimension: 'meta', value: 'forca', users: 5, with_plan: 5, trained_30d: 2, never_trained: 2, sessions_per_week: 1.5, adherence_pct: 30, pain_users: 0 },
    { dimension: 'nivel', value: 'iniciante', users: 4, with_plan: 4, trained_30d: 4, never_trained: 0, sessions_per_week: null, adherence_pct: null, pain_users: 0 },
  ];
  const rhythm = [
    { kind: 'weekday', bucket: 1, sessions: 20 },
    { kind: 'weekday', bucket: 3, sessions: 10 },
    { kind: 'hour', bucket: 7, sessions: 15 },
    { kind: 'hour', bucket: 18, sessions: 9 },
  ];

  function mockData(s = summary) {
    mockRpc.mockImplementation(async name => {
      if (name === 'admin_plan_summary') return { data: s ? [s] : [], error: null };
      if (name === 'admin_plan_breakdown') return { data: breakdown, error: null };
      return { data: rhythm, error: null };
    });
  }

  it('mostra os indicadores do resumo', async () => {
    mockData();
    wrap(<PlanAnalytics />);
    expect(await screen.findByText('40 de 50')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('8 sem.')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_training_rhythm', { days_back: 90 });
  });

  it('avisa sobre planos vencidos e ainda ativos', async () => {
    mockData();
    wrap(<PlanAnalytics />);
    const link = await screen.findByText('3 plano(s) já venceram e continuam ativos');
    expect(link.closest('a').getAttribute('href')).toBe('/engajamento');
  });

  it('não mostra o aviso quando nenhum plano venceu', async () => {
    mockData({ ...summary, expired_active: 0 });
    wrap(<PlanAnalytics />);
    await screen.findByText('40 de 50');
    expect(screen.queryByText(/já venceram/)).toBeNull();
  });

  it('marca a menor aderência e os relatos de dor', async () => {
    mockData();
    wrap(<PlanAnalytics />);
    expect(await screen.findByText('menor aderência')).toBeTruthy();
    expect(screen.getByText('2 (20%)')).toBeTruthy();
    expect(screen.getByText('massa')).toBeTruthy();
    expect(screen.getByText('iniciante')).toBeTruthy();
  });

  it('destaca os melhores dias e horários', async () => {
    mockData();
    wrap(<PlanAnalytics />);
    expect(await screen.findByText('Seg e Qua')).toBeTruthy();
    expect(screen.getByText('07h e 18h')).toBeTruthy();
    expect(screen.getByRole('img', { name: /dia da semana/ })).toBeTruthy();
  });

  it('funciona sem linha de resumo', async () => {
    mockData(null);
    wrap(<PlanAnalytics />);
    expect(await screen.findByText('Análise dos planos')).toBeTruthy();
    expect(screen.queryByText('Usuários com plano ativo')).toBeNull();
  });

  it('mostra erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('negado') });
    wrap(<PlanAnalytics />);
    expect(await screen.findByText('negado')).toBeTruthy();
  });
});

describe('Feedback', () => {
  const item = {
    id: 'f1', user_id: 'u1', email: 'a@x.com', nome: 'Ana', kind: 'problema', status: 'novo',
    message: 'O app travou', admin_note: '', admin_reply: null, replied_at: null, resolved_at: null,
    created_at: '2026-03-01T12:00:00Z', total_count: 1, novos: 1,
  };
  let updateEq;
  let deleteEq;

  beforeEach(() => {
    updateEq = vi.fn().mockResolvedValue({ error: null });
    deleteEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ update: vi.fn(() => ({ eq: updateEq })), delete: vi.fn(() => ({ eq: deleteEq })) });
    mockRpc.mockResolvedValue({ data: [item], error: null });
    mockInvoke.mockResolvedValue({ data: {}, error: null });
  });

  it('lista o feedback e filtra por "novo" por padrão', async () => {
    wrap(<Feedback />);
    expect(await screen.findByText('O app travou')).toBeTruthy();
    expect(screen.getByText(/1 novo\(s\) aguardando\./)).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_list_feedback', { status_filter: 'novo', kind_filter: null, page_size: 50, page_offset: 0 });
  });

  it('troca o filtro de status e o de tipo', async () => {
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith('admin_list_feedback', expect.objectContaining({ status_filter: null })));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'elogio' } });
    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith('admin_list_feedback', expect.objectContaining({ kind_filter: 'elogio' })));
  });

  it('altera o status do feedback', async () => {
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'em_andamento' } });
    await waitFor(() => expect(updateEq).toHaveBeenCalledWith('id', 'f1'));
    expect(mockFrom.mock.results[0].value.update).toHaveBeenCalledWith({ status: 'em_andamento' });
  });

  it('salva a nota interna só quando muda', async () => {
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    const save = screen.getByText('Salvar nota');
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nota interna (o usuário não vê)'), { target: { value: ' ver logs ' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(mockFrom.mock.results[0].value.update).toHaveBeenCalledWith({ admin_note: 'ver logs' }));
  });

  it('responde, marca como resolvido e avisa o usuário', async () => {
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    const send = screen.getByText('Enviar resposta');
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Responder ao usuário/), { target: { value: 'Já corrigimos!' } });
    fireEvent.click(send);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', {
      body: { title: '💬 Resposta ao seu feedback', body: 'Já corrigimos!', targetUserIds: ['u1'] },
    }));
    const patch = mockFrom.mock.results[0].value.update.mock.calls[0][0];
    expect(patch).toMatchObject({ admin_reply: 'Já corrigimos!', status: 'resolvido' });
  });

  it('avisa quando a notificação falha, mas a resposta foi salva', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('push') });
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    fireEvent.change(screen.getByLabelText(/Responder ao usuário/), { target: { value: 'oi' } });
    fireEvent.click(screen.getByText('Enviar resposta'));
    expect(await screen.findByText(/Resposta salva, mas o aviso ao usuário falhou/)).toBeTruthy();
  });

  it('mostra o erro quando atualizar falha', async () => {
    updateEq.mockResolvedValue({ error: new Error('rls') });
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'resolvido' } });
    expect(await screen.findByText('Erro: rls')).toBeTruthy();
  });

  it('exclui após confirmação', async () => {
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    fireEvent.click(screen.getByText('Excluir'));
    await waitFor(() => expect(deleteEq).toHaveBeenCalledWith('id', 'f1'));
  });

  it('não exclui se cancelar', async () => {
    window.confirm.mockReturnValue(false);
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    fireEvent.click(screen.getByText('Excluir'));
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it('mostra a resposta anterior e esconde "marcar como resolvido" em itens resolvidos', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...item, status: 'resolvido', admin_reply: 'Feito', replied_at: '2026-03-02T12:00:00Z', resolved_at: '2026-03-02T12:00:00Z' }], error: null });
    wrap(<Feedback />);
    expect(await screen.findByText('Feito')).toBeTruthy();
    expect(screen.queryByText('Marcar como resolvido')).toBeNull();
    expect(screen.getByText('Nova resposta ao usuário')).toBeTruthy();
  });

  it('estado vazio e erro', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { unmount } = wrap(<Feedback />);
    expect(await screen.findByText('Nenhum feedback com esses filtros.')).toBeTruthy();
    unmount();
    mockRpc.mockResolvedValue({ data: null, error: new Error('negado') });
    wrap(<Feedback />);
    expect(await screen.findByText('negado')).toBeTruthy();
  });

  it('pagina quando há mais de uma página', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...item, total_count: 120 }], error: null });
    wrap(<Feedback />);
    await screen.findByText('O app travou');
    fireEvent.click(screen.getByText('Próxima'));
    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith('admin_list_feedback', expect.objectContaining({ page_offset: 50 })));
  });
});
