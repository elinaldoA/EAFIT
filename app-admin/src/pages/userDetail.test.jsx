// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { mockFrom, mockRpc, mockInvoke, mockDownload } = vi.hoisted(() => ({
  mockFrom: vi.fn(), mockRpc: vi.fn(), mockInvoke: vi.fn(), mockDownload: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: { from: mockFrom, rpc: mockRpc, functions: { invoke: mockInvoke } } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1', email: 'adm@x.com' } }) }));
vi.mock('../lib/csv', async orig => ({ ...(await orig()), downloadCsv: mockDownload }));

import UserDetail from './UserDetail';
import UserActionsTab from './UserActionsTab';
import UserNotesTab from './UserNotesTab';
import UserProfileTab from './UserProfileTab';
import UserWorkoutsTab from './UserWorkoutsTab';

// Query builder encadeável e "thenable".
function q(result) {
  const obj = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      return () => obj;
    },
  });
  return obj;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('UserActionsTab', () => {
  const base = {
    detail: { id: 'u1', email_confirmed_at: '2026-01-01', is_admin: false },
    adminUser: { id: 'adm1' }, busy: false, recoveryLink: '', isBanned: false, hasProfile: true,
    onRunAction: vi.fn(), onToggleAdmin: vi.fn(), onGeneratePlan: vi.fn(), trainerCode: null, onToggleTrainer: vi.fn(),
  };
  const renderTab = (over = {}) => render(<UserActionsTab {...base} {...over} />);

  it('banir pede confirmação via onRunAction; desbanir quando já banido', () => {
    const onRunAction = vi.fn();
    const { unmount } = renderTab({ onRunAction });
    fireEvent.click(screen.getByText('Banir usuário'));
    expect(onRunAction).toHaveBeenCalledWith('ban', {}, 'Banir este usuário?');
    unmount();
    renderTab({ onRunAction, isBanned: true });
    fireEvent.click(screen.getByText('Desbanir usuário'));
    expect(onRunAction).toHaveBeenCalledWith('unban');
  });

  it('só mostra "Confirmar e-mail" para e-mail não confirmado', () => {
    const { unmount } = renderTab();
    expect(screen.queryByText('Confirmar e-mail')).toBeNull();
    unmount();
    renderTab({ detail: { ...base.detail, email_confirmed_at: null } });
    expect(screen.getByText('Confirmar e-mail')).toBeTruthy();
  });

  it('esconde "tornar admin" na própria conta', () => {
    const { unmount } = renderTab({ detail: { ...base.detail, id: 'adm1' } });
    expect(screen.queryByText('Tornar admin')).toBeNull();
    unmount();
    renderTab({ detail: { ...base.detail, is_admin: true } });
    expect(screen.getByText('Remover admin')).toBeTruthy();
  });

  it('mostra o código do personal e o link de redefinição', () => {
    renderTab({ trainerCode: 'ABC123', recoveryLink: 'https://x/reset' });
    expect(screen.getByText('Remover personal (código ABC123)')).toBeTruthy();
    expect(screen.getByDisplayValue('https://x/reset')).toBeTruthy();
  });

  it('desabilita geração de plano sem peso/altura', () => {
    renderTab({ hasProfile: false });
    expect(screen.getByText('Gerar novo treino').disabled).toBe(true);
    expect(screen.getByText(/não é possível gerar plano/)).toBeTruthy();
  });

  it('gerar plano envia a mensagem de confirmação', () => {
    const onGeneratePlan = vi.fn();
    renderTab({ onGeneratePlan });
    fireEvent.click(screen.getByText('Gerar novo treino'));
    expect(onGeneratePlan.mock.calls[0][0]).toMatch(/novo treino/);
  });

  it('excluir conta exige confirmação textual permanente', () => {
    const onRunAction = vi.fn();
    renderTab({ onRunAction });
    fireEvent.click(screen.getByText('Excluir conta'));
    expect(onRunAction).toHaveBeenCalledWith('deleteUser', {}, 'Excluir esta conta e todos os dados permanentemente?');
  });
});

describe('UserNotesTab', () => {
  let insertSpy;
  let notes;

  beforeEach(() => {
    notes = [{ id: 'n1', note: 'Pediu pausa', admin_email: 'a@x.com', created_at: '2026-03-01T12:00:00Z' }];
    insertSpy = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => new Proxy(q({ data: notes }), {
      get(t, prop) { return prop === 'insert' ? insertSpy : t[prop]; },
    }));
  });

  it('lista notas existentes', async () => {
    render(<UserNotesTab userId="u1" adminUser={{ id: 'adm1', email: 'adm@x.com' }} />);
    expect(await screen.findByText('Pediu pausa')).toBeTruthy();
  });

  it('mostra vazio', async () => {
    notes = [];
    render(<UserNotesTab userId="u1" adminUser={{ id: 'adm1' }} />);
    expect(await screen.findByText('Nenhuma nota para este usuário.')).toBeTruthy();
  });

  it('adiciona nota aparada e limpa o campo', async () => {
    render(<UserNotesTab userId="u1" adminUser={{ id: 'adm1', email: 'adm@x.com' }} />);
    await screen.findByText('Pediu pausa');
    const add = screen.getByText('Adicionar nota');
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Nova nota interna/), { target: { value: '  Voltou  ' } });
    fireEvent.click(add);
    await waitFor(() => expect(insertSpy).toHaveBeenCalledWith({ user_id: 'u1', admin_id: 'adm1', admin_email: 'adm@x.com', note: 'Voltou' }));
    await waitFor(() => expect(screen.getByLabelText(/Nova nota interna/).value).toBe(''));
  });

  it('mostra erro ao adicionar e mantém o texto', async () => {
    insertSpy.mockResolvedValue({ error: { message: 'rls' } });
    render(<UserNotesTab userId="u1" adminUser={{ id: 'adm1' }} />);
    await screen.findByText('Pediu pausa');
    fireEvent.change(screen.getByLabelText(/Nova nota interna/), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Adicionar nota'));
    expect(await screen.findByText('rls')).toBeTruthy();
    expect(screen.getByLabelText(/Nova nota interna/).value).toBe('x');
  });

  it('exclui após confirmar', async () => {
    render(<UserNotesTab userId="u1" adminUser={{ id: 'adm1' }} />);
    await screen.findByText('Pediu pausa');
    fireEvent.click(screen.getByText('Excluir'));
    expect(window.confirm).toHaveBeenCalledWith('Excluir esta nota?');
    await waitFor(() => expect(mockFrom.mock.calls.length).toBeGreaterThan(2));
  });

  it('não exclui se cancelar', async () => {
    window.confirm.mockReturnValue(false);
    render(<UserNotesTab userId="u1" adminUser={{ id: 'adm1' }} />);
    await screen.findByText('Pediu pausa');
    const before = mockFrom.mock.calls.length;
    fireEvent.click(screen.getByText('Excluir'));
    expect(mockFrom.mock.calls.length).toBe(before);
  });
});

describe('UserProfileTab', () => {
  const form = { nome: 'Ana', sobrenome: '', apelido: '', sexo: '', idade: '', peso: '', altura: '', meta: 'massa', nivel: 'iniciante', pesoAlvo: '' };
  const props = { form, setForm: vi.fn(), busy: false, onSaveProfile: vi.fn(e => e.preventDefault()), achievements: [], progressPhotos: [], weightLogs: [], waterLogs: [] };

  it('edita campos via setForm e envia o formulário', () => {
    const setForm = vi.fn();
    const onSaveProfile = vi.fn(e => e.preventDefault());
    render(<UserProfileTab {...props} setForm={setForm} onSaveProfile={onSaveProfile} />);
    fireEvent.change(screen.getByDisplayValue('Ana'), { target: { value: 'Bia' } });
    expect(setForm).toHaveBeenCalledWith({ ...form, nome: 'Bia' });
    fireEvent.click(screen.getByText('Salvar perfil'));
    expect(onSaveProfile).toHaveBeenCalled();
  });

  it('mostra estados vazios', () => {
    render(<UserProfileTab {...props} />);
    expect(screen.getByText('Nenhuma conquista desbloqueada ainda.')).toBeTruthy();
    expect(screen.getByText('Sem fotos de progresso.')).toBeTruthy();
    expect(screen.getAllByText('Sem registros.')).toHaveLength(2);
  });

  it('mostra conquistas (com rótulo ou id), fotos e registros', () => {
    render(<UserProfileTab {...props}
      achievements={[{ id: 1, badge_id: 'streak_7', unlocked_at: '2026-03-01T12:00:00Z' }, { id: 2, badge_id: 'desconhecida', unlocked_at: null }]}
      progressPhotos={[{ id: 'p1', photo_date: '2026-03-01', image_data: 'data:x', note: 'costas' }]}
      weightLogs={[{ id: 'w1', log_date: '2026-03-01', weight: 80.5 }]}
      waterLogs={[{ id: 'a1', log_date: '2026-03-01', amount_ml: 2000 }]}
    />);
    expect(screen.getByText(/Sequência de 7 dias/)).toBeTruthy();
    expect(screen.getByText('desconhecida')).toBeTruthy();
    expect(screen.getByAltText('Foto de progresso de 2026-03-01')).toBeTruthy();
    expect(screen.getByText('costas')).toBeTruthy();
    expect(screen.getByText('80.5')).toBeTruthy();
    expect(screen.getByText('2000')).toBeTruthy();
  });
});

describe('UserWorkoutsTab', () => {
  const plan = {
    name: 'Plano A', start_date: '2026-03-01', end_date: '2026-04-01', duration_weeks: 4,
    plan_days: [
      { id: 'd1', dia: 'Seg', foco: 'Peito', plan_exercises: [{ id: 'x1', nome: 'Supino', series: 3, reps: '10', descanso: '60s', is_post_workout: false }, { id: 'x2', nome: 'Prancha', series: 3, reps: '30s', descanso: '30s', is_post_workout: true }] },
      { id: 'd2', dia: 'Ter', foco: 'Descanso', plan_exercises: [] },
    ],
  };
  const base = {
    activePlan: null, workouts: [], expandedWorkoutId: null, workoutSets: {}, setsLoading: false,
    onToggleWorkoutDetail: vi.fn(), onExportTreinos: vi.fn(), personalRecords: [], discomfortLogs: [],
  };

  it('estados vazios', () => {
    render(<UserWorkoutsTab {...base} />);
    expect(screen.getByText('Sem plano de treino ativo.')).toBeTruthy();
    expect(screen.getByText('Sem treinos registrados.')).toBeTruthy();
    expect(screen.getByText('Sem recordes pessoais registrados.')).toBeTruthy();
    expect(screen.getByText('Nenhum registro de dor ou desconforto.')).toBeTruthy();
    expect(screen.getByText('Exportar CSV').disabled).toBe(true);
  });

  it('mostra o plano ativo com dias e exercícios', () => {
    render(<UserWorkoutsTab {...base} activePlan={plan} />);
    expect(screen.getByText('Plano de treino ativo — Plano A')).toBeTruthy();
    expect(screen.getByText(/Vigência 2026-03-01 a 2026-04-01 \(4 semanas\)/)).toBeTruthy();
    expect(screen.getByText('Seg — Peito')).toBeTruthy();
    expect(screen.getByText('🔷 Prancha')).toBeTruthy();
    expect(screen.getByText('Dia de descanso.')).toBeTruthy();
  });

  it('lista treinos, alterna detalhes e mostra as séries', () => {
    const onToggle = vi.fn();
    const workouts = [{ id: 'w1', workout_date: '2026-03-01', day_of_week: 'Seg', completed: true, duration_seconds: 3600 }];
    const { rerender } = render(<UserWorkoutsTab {...base} workouts={workouts} onToggleWorkoutDetail={onToggle} />);
    expect(screen.getByText('60 min')).toBeTruthy();
    fireEvent.click(screen.getByText('Ver séries'));
    expect(onToggle).toHaveBeenCalledWith('w1');

    rerender(<UserWorkoutsTab {...base} workouts={workouts} expandedWorkoutId="w1" workoutSets={{ w1: [{ id: 's1', exercise_name: 'Supino', set_number: 1, carga: 50, reps: null, completed: false }] }} />);
    expect(screen.getByText('Ocultar séries')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
    expect(screen.getByText('não', { selector: 'td[data-label="Concluída"]' })).toBeTruthy();

    rerender(<UserWorkoutsTab {...base} workouts={workouts} expandedWorkoutId="w1" workoutSets={{ w1: [] }} />);
    expect(screen.getByText('Sem séries registradas para este treino.')).toBeTruthy();

    rerender(<UserWorkoutsTab {...base} workouts={workouts} expandedWorkoutId="w1" setsLoading />);
    expect(screen.getByText('Carregando séries…')).toBeTruthy();
  });

  it('mostra recordes e dor com severidade', () => {
    render(<UserWorkoutsTab {...base}
      personalRecords={[{ exercise_name: 'Agachamento', carga: 100, oneRm: 133.3 }, { exercise_name: 'Remada', carga: 60, oneRm: null }]}
      discomfortLogs={[{ id: 'd1', log_date: '2026-03-01', exercise_name: 'Supino', severity: 'forte', note: '' }]}
    />);
    expect(screen.getByText('133kg')).toBeTruthy();
    expect(screen.getByText('Forte')).toBeTruthy();
    const row = screen.getByText('Remada').closest('tr');
    expect(within(row).getByText('—')).toBeTruthy();
  });
});

describe('UserDetail', () => {
  const userRow = {
    id: 'u1', email: 'u@x.com', created_at: '2026-01-01T12:00:00Z', last_sign_in_at: null, is_admin: false,
    banned_until: null, email_confirmed_at: '2026-01-01',
    user_metadata: { nome: 'Ana', peso: 70, altura: 170, meta: 'forca', nivel: 'avancado', trainingHour: 7 },
  };
  let tables;

  beforeEach(() => {
    tables = {
      workout_plans: { data: null },
      workouts: { data: [{ id: 'w1', workout_date: '2026-03-01', day_of_week: 'Seg', completed: true, duration_seconds: 1800 }] },
      water_logs: { data: [] }, weight_logs: { data: [] }, exercise_discomfort: { data: [] },
      achievements: { data: [] }, progress_photos: { data: [] },
      push_subscriptions: { count: 2 },
      exercise_sets: { data: [{ id: 's1', exercise_name: 'Supino', set_number: 1, carga: 60, reps: 10, completed: true }] },
      trainers: { data: null },
      profiles: { error: null },
      admin_audit_log: { error: null },
    };
    mockFrom.mockImplementation(table => q(tables[table] || { data: [] }));
    mockRpc.mockImplementation(async name => (name === 'admin_get_user' ? { data: [userRow], error: null } : { error: null }));
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  const renderPage = () => render(
    <MemoryRouter initialEntries={['/users/u1']}>
      <Routes>
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/users" element={<div>lista-usuarios</div>} />
      </Routes>
    </MemoryRouter>
  );

  const goTab = name => fireEvent.click(screen.getByRole('button', { name }));

  it('mostra cabeçalho com push ativo e horário de treino', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'u@x.com' })).toBeTruthy();
    expect(screen.getByText(/2 dispositivo\(s\) com push ativo/)).toBeTruthy();
    expect(screen.getByText(/treina por volta das 07h/)).toBeTruthy();
    expect(screen.getByDisplayValue('Ana')).toBeTruthy();
  });

  it('mostra erro quando o usuário não existe', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    renderPage();
    expect(await screen.findByText('Usuário não encontrado.')).toBeTruthy();
  });

  it('mostra erro da RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    renderPage();
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });

  it('badges de admin, banido e pausa', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...userRow, is_admin: true, banned_until: '2999-01-01T00:00:00Z', user_metadata: { ...userRow.user_metadata, pausedUntil: '2999-12-25' } }], error: null });
    renderPage();
    expect(await screen.findByText('admin')).toBeTruthy();
    expect(screen.getByText('banido')).toBeTruthy();
    expect(screen.getByText('⏸ pausado até 25/12')).toBeTruthy();
  });

  it('salvar perfil chama a função admin-users com os campos', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    fireEvent.change(screen.getByDisplayValue('Ana'), { target: { value: 'Bia' } });
    fireEvent.click(screen.getByText('Salvar perfil'));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('admin-users', expect.objectContaining({
      body: expect.objectContaining({ action: 'updateProfile', targetUserId: 'u1', fields: expect.objectContaining({ nome: 'Bia', meta: 'forca' }) }),
    })));
    expect(await screen.findByText('Ação concluída.')).toBeTruthy();
  });

  it('aba Treinos: carrega séries sob demanda e exporta CSV', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Treinos');
    fireEvent.click(screen.getByText('Ver séries'));
    expect(await screen.findByText('Supino', { selector: 'td[data-label="Exercício"]' })).toBeTruthy();
    fireEvent.click(screen.getByText('Ocultar séries'));
    fireEvent.click(screen.getByText('Exportar CSV'));
    expect(mockDownload.mock.calls[0][0]).toBe('treinos_u1.csv');
    expect(mockDownload.mock.calls[0][1]).toContain('2026-03-01,Seg,true,1800');
  });

  it('aba Treinos: calcula recordes pessoais a partir das séries', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Treinos');
    expect(await screen.findByText('60kg')).toBeTruthy();
    expect(screen.getByText('80kg')).toBeTruthy();
  });

  it('aba Ações: banir confirma e chama a função', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Banir usuário'));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('admin-users', { body: { action: 'ban', targetUserId: 'u1' } }));
  });

  it('aba Ações: cancelar a confirmação não chama a função', async () => {
    window.confirm.mockReturnValue(false);
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Banir usuário'));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('aba Ações: redefinição de senha mostra o link', async () => {
    mockInvoke.mockResolvedValue({ data: { actionLink: 'https://x/recover' }, error: null });
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Gerar link de redefinição de senha'));
    expect(await screen.findByDisplayValue('https://x/recover')).toBeTruthy();
  });

  it('aba Ações: excluir conta volta para a lista', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Excluir conta'));
    expect(await screen.findByText('lista-usuarios')).toBeTruthy();
  });

  it('aba Ações: erro da função aparece como mensagem', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'proibido' }, error: null });
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Banir usuário'));
    expect(await screen.findByText('Erro: proibido')).toBeTruthy();
  });

  it('aba Ações: tornar admin atualiza profiles e registra auditoria', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Tornar admin'));
    expect(await screen.findByText('Ação concluída.')).toBeTruthy();
    const tablesUsed = mockFrom.mock.calls.map(c => c[0]);
    expect(tablesUsed).toContain('profiles');
    expect(tablesUsed).toContain('admin_audit_log');
  });

  it('aba Ações: liberar personal usa a RPC admin_set_trainer', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Tornar personal trainer'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_set_trainer', { p_user: 'u1', p_on: true }));
  });

  it('aba Ações: remover personal existente', async () => {
    tables.trainers = { data: { code: 'XYZ' } };
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(await screen.findByText('Remover personal (código XYZ)'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_set_trainer', { p_user: 'u1', p_on: false }));
  });

  it('aba Ações: gerar plano chama admin-generate-plan', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Ações');
    fireEvent.click(screen.getByText('Gerar novo treino'));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('admin-generate-plan', { body: { kind: 'workout', targetUserId: 'u1' } }));
  });

  it('aba Notas renderiza as notas do usuário', async () => {
    tables.admin_user_notes = { data: [{ id: 'n1', note: 'Nota X', admin_email: 'a@x.com', created_at: '2026-03-01T12:00:00Z' }] };
    renderPage();
    await screen.findByRole('heading', { name: 'u@x.com' });
    goTab('Notas');
    expect(await screen.findByText('Nota X')).toBeTruthy();
  });
});
