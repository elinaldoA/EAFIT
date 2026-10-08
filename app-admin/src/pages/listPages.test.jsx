// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, ce, bh, users } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  ce: { fetchClientErrors: vi.fn(), purgeOldClientErrors: vi.fn() },
  bh: { fetchBroadcastHistory: vi.fn() },
  users: { fetchUsers: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../lib/clientErrors', async orig => ({ ...(await orig()), ...ce }));
vi.mock('../lib/broadcastHistory', async orig => ({ ...(await orig()), ...bh }));
vi.mock('../lib/users', () => users);
vi.mock('../components/WorkoutTemplateEditor', () => ({
  default: ({ days, onChange }) => (
    <div>
      <span>editor:{days.length}</span>
      <button onClick={() => onChange([...days, { name: 'novo' }])}>add-dia</button>
    </div>
  ),
}));

import Templates from './Templates';
import Safety from './Safety';
import Trainers from './Trainers';
import BroadcastHistory from './BroadcastHistory';
import ClientErrors from './ClientErrors';
import AuditLog from './AuditLog';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Templates', () => {
  let chain;
  let updateEq;

  beforeEach(() => {
    updateEq = vi.fn().mockResolvedValue({ error: null });
    chain = {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { days: [{ name: 'A' }] }, error: null }) })) })),
      update: vi.fn(() => ({ eq: updateEq })),
    };
    mockFrom.mockReturnValue(chain);
  });

  it('carrega o template da meta inicial', async () => {
    wrap(<Templates />);
    expect(await screen.findByText('editor:1')).toBeTruthy();
    expect(mockFrom).toHaveBeenCalledWith('workout_templates');
  });

  it('recarrega ao trocar a meta', async () => {
    wrap(<Templates />);
    await screen.findByText('editor:1');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forca' } });
    await waitFor(() => expect(mockFrom).toHaveBeenCalledTimes(2));
  });

  it('salva as alterações da meta atual', async () => {
    wrap(<Templates />);
    await screen.findByText('editor:1');
    fireEvent.click(screen.getByText('add-dia'));
    fireEvent.click(screen.getByText('Salvar'));
    expect(await screen.findByText('Salvo!')).toBeTruthy();
    expect(chain.update.mock.calls[0][0].days).toHaveLength(2);
    expect(updateEq).toHaveBeenCalledWith('meta', 'massa');
  });

  it('mostra erro ao salvar', async () => {
    updateEq.mockResolvedValue({ error: new Error('rls') });
    wrap(<Templates />);
    await screen.findByText('editor:1');
    fireEvent.click(screen.getByText('Salvar'));
    expect(await screen.findByText('Erro: rls')).toBeTruthy();
  });

  it('mostra erro ao carregar', async () => {
    chain.select.mockReturnValue({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('sem template') }) }) });
    wrap(<Templates />);
    expect(await screen.findByText('sem template')).toBeTruthy();
    expect(screen.queryByText('Salvar')).toBeNull();
  });
});

describe('Safety', () => {
  const row = { id: 'r1', log_date: '2026-03-01', user_id: 'u1', user_email: 'a@x.com', exercise_name: 'Supino', severity: 'forte', note: '', total_count: 120 };

  it('pede só dor forte por padrão e lista os relatos', async () => {
    mockRpc.mockResolvedValue({ data: [row], error: null });
    wrap(<Safety />);
    expect(await screen.findByText('Supino')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_list_discomfort', { only_severe: true, page_size: 50, page_offset: 0 });
    expect(screen.getByText('Forte')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('a@x.com').getAttribute('href')).toBe('/users/u1');
  });

  it('checkbox inclui leve/moderada', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    wrap(<Safety />);
    await screen.findByText('Nenhum relato de dor forte ou lesão.');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByText('Nenhum relato de dor ou desconforto.')).toBeTruthy();
    expect(mockRpc).toHaveBeenLastCalledWith('admin_list_discomfort', { only_severe: false, page_size: 50, page_offset: 0 });
  });

  it('pagina com total_count', async () => {
    mockRpc.mockResolvedValue({ data: [row], error: null });
    wrap(<Safety />);
    expect(await screen.findByText(/120 registro\(s\) · página 1 de 3/)).toBeTruthy();
    expect(screen.getByText('Anterior').disabled).toBe(true);
    fireEvent.click(screen.getByText('Próxima'));
    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith('admin_list_discomfort', { only_severe: true, page_size: 50, page_offset: 50 }));
  });

  it('mostra erro da RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    wrap(<Safety />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});

describe('Trainers', () => {
  const trainers = [
    { tc_user: 't1', tc_name: 'Carlos', tc_email: 'c@x.com', tc_code: 'ABC123', tc_clients: '2', tc_since: '2026-01-10T12:00:00Z' },
    { tc_user: 't2', tc_name: 'Dani', tc_email: 'd@x.com', tc_code: 'XYZ', tc_clients: 3, tc_since: null },
  ];

  it('lista personais e soma os alunos', async () => {
    mockRpc.mockResolvedValue({ data: trainers, error: null });
    wrap(<Trainers />);
    expect(await screen.findByText('Carlos')).toBeTruthy();
    expect(screen.getByText('2 personal(is) · 5 aluno(s) vinculado(s)')).toBeTruthy();
    expect(screen.getByText('ABC123')).toBeTruthy();
  });

  it('estado vazio', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    wrap(<Trainers />);
    expect(await screen.findByText(/Nenhum personal liberado/)).toBeTruthy();
  });

  it('mostra erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('negado') });
    wrap(<Trainers />);
    expect(await screen.findByText('negado')).toBeTruthy();
  });

  it('expande e recolhe os alunos de um personal', async () => {
    mockRpc.mockImplementation(async fn => {
      if (fn === 'admin_list_trainers') return { data: trainers, error: null };
      return { data: [{ tcl_user: 'u9', tcl_name: 'Aluno Nove', tcl_since: '2026-02-01T12:00:00Z', tcl_days30: 12 }], error: null };
    });
    wrap(<Trainers />);
    await screen.findByText('Carlos');
    fireEvent.click(screen.getAllByText('Ver alunos')[0]);
    expect(await screen.findByText('Aluno Nove')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_trainer_clients', { p_trainer: 't1' });
    fireEvent.click(screen.getByText('Ocultar alunos'));
    expect(screen.queryByText('Aluno Nove')).toBeNull();
  });

  it('mostra aulas, taxa de confirmação, recados e as próximas aulas', async () => {
    mockRpc.mockImplementation(async fn => {
      if (fn === 'admin_list_trainers') return { data: trainers, error: null };
      if (fn === 'admin_trainer_activity') {
        return { data: [{ ta_user: 't1', ta_appts: 10, ta_confirmed: 6, ta_declined: 2, ta_cancelled: 2, ta_pending: 0, ta_upcoming: 3, ta_messages: 9, ta_read: 7, ta_last_message: '2026-03-01T12:00:00Z' }], error: null };
      }
      if (fn === 'admin_upcoming_appointments') {
        return { data: [{ ua_id: 'a1', ua_trainer: 't1', ua_trainer_name: 'Carlos P.', ua_client: 'u9', ua_client_name: 'Aluno Nove', ua_starts: '2026-03-10T12:00:00Z', ua_duration: 60, ua_status: 'pending' }], error: null };
      }
      return { data: [], error: null };
    });
    wrap(<Trainers />);
    await screen.findByText('Carlos');
    expect(await screen.findByText('· 75% confirmadas')).toBeTruthy();
    expect(screen.getByText('3 marcada(s) à frente')).toBeTruthy();
    expect(screen.getByText('· 7 lido(s)')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_trainer_activity', { days_back: 30 });
    expect(await screen.findByText('Próximas aulas')).toBeTruthy();
    expect(screen.getByText('Aluno Nove').getAttribute('href')).toBe('/users/u9');
    expect(screen.getByText('aguardando aluno')).toBeTruthy();
  });

  it('personal sem alunos ativos', async () => {
    mockRpc.mockImplementation(async fn => (fn === 'admin_list_trainers' ? { data: trainers, error: null } : { data: [], error: null }));
    wrap(<Trainers />);
    await screen.findByText('Carlos');
    fireEvent.click(screen.getAllByText('Ver alunos')[0]);
    expect(await screen.findByText('Nenhum aluno ativo.')).toBeTruthy();
  });
});

describe('BroadcastHistory', () => {
  const audit = [
    { id: 1, created_at: '2026-03-02T10:00:00Z', details: { title: 'Manual 1', body: 'corpo m', targetCount: 10, sent: 8 } },
    { id: 2, created_at: '2026-03-03T10:00:00Z', details: { title: 'Agendada 1', body: 'corpo a', scheduled: true, targetCount: 5, sent: 5 } },
  ];
  const auto = [{ id: 9, user_id: 'u1', kind: 'streak', title: 'Auto 1', body: 'corpo auto', created_at: '2026-03-04T10:00:00Z' }];

  beforeEach(() => {
    bh.fetchBroadcastHistory.mockResolvedValue({ audit, auto });
    users.fetchUsers.mockResolvedValue([{ id: 'u1', email: 'a@x.com' }]);
  });

  it('mescla origens e resolve o e-mail do destinatário automático', async () => {
    wrap(<BroadcastHistory />);
    expect(await screen.findByText('Auto 1')).toBeTruthy();
    expect(screen.getByText('Manual 1')).toBeTruthy();
    expect(screen.getByText('a@x.com')).toBeTruthy();
    expect(screen.getByText('Automática · streak')).toBeTruthy();
    expect(screen.getByText('8 / 10')).toBeTruthy();
  });

  it('filtra por origem', async () => {
    wrap(<BroadcastHistory />);
    await screen.findByText('Auto 1');
    fireEvent.click(screen.getByRole('button', { name: 'Agendados' }));
    expect(screen.getByText('Agendada 1')).toBeTruthy();
    expect(screen.queryByText('Manual 1')).toBeNull();
    expect(screen.queryByText('Auto 1')).toBeNull();
  });

  it('tolera falha ao buscar usuários', async () => {
    users.fetchUsers.mockRejectedValue(new Error('x'));
    wrap(<BroadcastHistory />);
    expect(await screen.findByText('Auto 1')).toBeTruthy();
    expect(screen.queryByText('a@x.com')).toBeNull();
  });

  it('estado vazio', async () => {
    bh.fetchBroadcastHistory.mockResolvedValue({ audit: [], auto: [] });
    wrap(<BroadcastHistory />);
    expect(await screen.findByText('Nenhum envio por aqui ainda.')).toBeTruthy();
  });

  it('mostra erro do histórico', async () => {
    bh.fetchBroadcastHistory.mockRejectedValue(new Error('falha hist'));
    wrap(<BroadcastHistory />);
    expect(await screen.findByText('falha hist')).toBeTruthy();
  });
});

describe('ClientErrors', () => {
  const rows = [
    { id: 'e1', user_id: '12345678-aaaa', kind: 'unhandledrejection', message: 'Boom', stack: 'at x()', url: '/treino', created_at: '2026-03-01T10:00:00Z' },
    { id: 'e2', user_id: 'abcdefgh-bbbb', kind: 'outro', message: 'Sem stack', stack: null, url: null, created_at: null },
  ];

  it('lista erros com rótulo do tipo e usuário abreviado', async () => {
    ce.fetchClientErrors.mockResolvedValue({ rows, total: 2 });
    wrap(<ClientErrors />);
    expect(await screen.findByText('Boom')).toBeTruthy();
    expect(screen.getByText('Promise rejeitada')).toBeTruthy();
    expect(screen.getByText('12345678')).toBeTruthy();
    expect(screen.getByText('outro')).toBeTruthy();
    expect(screen.getByText('at x()')).toBeTruthy();
  });

  it('estado vazio', async () => {
    ce.fetchClientErrors.mockResolvedValue({ rows: [], total: 0 });
    wrap(<ClientErrors />);
    expect(await screen.findByText('Nenhum erro registrado.')).toBeTruthy();
  });

  it('limpa erros antigos após confirmar e recarrega a primeira página', async () => {
    ce.fetchClientErrors.mockResolvedValue({ rows, total: 2 });
    ce.purgeOldClientErrors.mockResolvedValue(7);
    wrap(<ClientErrors />);
    await screen.findByText('Boom');
    fireEvent.click(screen.getByText('Limpar com mais de 30 dias'));
    expect(await screen.findByText('7 erro(s) apagado(s).')).toBeTruthy();
    expect(ce.purgeOldClientErrors).toHaveBeenCalledWith(30);
    expect(ce.fetchClientErrors).toHaveBeenLastCalledWith({ page: 0 });
  });

  it('não limpa se cancelar', async () => {
    window.confirm.mockReturnValue(false);
    ce.fetchClientErrors.mockResolvedValue({ rows, total: 2 });
    wrap(<ClientErrors />);
    await screen.findByText('Boom');
    fireEvent.click(screen.getByText('Limpar com mais de 30 dias'));
    expect(ce.purgeOldClientErrors).not.toHaveBeenCalled();
  });

  it('pagina', async () => {
    ce.fetchClientErrors.mockResolvedValue({ rows, total: 120 });
    wrap(<ClientErrors />);
    await screen.findByText('Boom');
    fireEvent.click(screen.getByText('Próxima'));
    await waitFor(() => expect(ce.fetchClientErrors).toHaveBeenLastCalledWith({ page: 1 }));
  });

  it('mostra erro ao carregar', async () => {
    ce.fetchClientErrors.mockRejectedValue(new Error('rls'));
    wrap(<ClientErrors />);
    expect(await screen.findByText('rls')).toBeTruthy();
  });
});

describe('AuditLog', () => {
  const rows = [
    { id: 1, created_at: '2026-03-01T10:00:00Z', admin_email: 'adm@x.com', action: 'ban', target_email: 'u@x.com', details: { reason: 'spam' }, total_count: 60 },
    { id: 2, created_at: '2026-03-02T10:00:00Z', admin_email: null, action: 'acaoNova', target_email: null, details: null, total_count: 60 },
  ];

  it('traduz ações conhecidas e mantém as desconhecidas', async () => {
    mockRpc.mockResolvedValue({ data: rows, error: null });
    wrap(<AuditLog />);
    expect(await screen.findByText('Baniu')).toBeTruthy();
    expect(screen.getByText('acaoNova')).toBeTruthy();
    expect(screen.getByText('adm@x.com')).toBeTruthy();
    expect(screen.getByText(/"reason": "spam"/)).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_list_audit_log', { page_size: 50, page_offset: 0 });
  });

  it('pagina usando total_count', async () => {
    mockRpc.mockResolvedValue({ data: rows, error: null });
    wrap(<AuditLog />);
    expect(await screen.findByText(/60 registro\(s\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Próxima'));
    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith('admin_list_audit_log', { page_size: 50, page_offset: 50 }));
    await screen.findByText(/página 2 de 2/);
    expect(screen.getByText('Próxima').disabled).toBe(true);
  });

  it('estado vazio', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    wrap(<AuditLog />);
    expect(await screen.findByText('Nenhuma ação registrada ainda.')).toBeTruthy();
  });

  it('mostra erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    wrap(<AuditLog />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
