// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, mockSign } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn(), mockSign: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  db: { rpc: mockRpc, from: mockFrom, storage: { from: () => ({ createSignedUrls: mockSign }) } },
}));

import { attentionBySection, fetchAttention } from '../lib/attention';
import { withSignedPhotos, parseSetNumber, fixWorkoutSet, deleteWorkout } from '../lib/userDetailHelpers';
import { bannerWindow, nextBannerVersion, normalizeSettings } from '../lib/appSettings';
import { fetchPurgeStats, purgeOld } from '../lib/ops';
import { gatherUserExport } from '../lib/userExport';
import Sidebar from '../components/Layout/Sidebar';
import UserFriendsCard from '../components/UserFriendsCard';
import UserWorkoutsTab from './UserWorkoutsTab';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('pendências no menu', () => {
  it('attentionBySection soma por seção e explica o número', () => {
    const out = attentionBySection({ feedback: 2, pain: 1, errors: 0, overdue: 3 });
    expect(out.acompanhamento).toEqual({ total: 3, title: '2 feedback(s) novo(s) · 1 relato(s) de dor forte/lesão em 7 dias' });
    expect(out.comunicacao.total).toBe(3);
    expect(out.sistema).toBeUndefined();
    expect(attentionBySection(null)).toEqual({});
  });

  it('fetchAttention mapeia a linha e devolve null sem dados', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ at_feedback: '2', at_pain: '0', at_errors: '5', at_overdue: '0' }], error: null });
    expect(await fetchAttention()).toEqual({ feedback: 2, pain: 0, errors: 5, overdue: 0 });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchAttention()).toBeNull();
  });

  it('a Sidebar mostra o contador na seção certa; sem resposta, fica sem contador', async () => {
    mockRpc.mockResolvedValue({ data: [{ at_feedback: 120, at_pain: 0, at_errors: 4, at_overdue: 0 }], error: null });
    const a = wrap(<Sidebar open={false} onClose={() => {}} />);
    expect(await screen.findByText('99+')).toBeTruthy();
    expect(screen.getByText('4').title).toBe('4 erro(s) do app em 24h');
    a.unmount();

    mockRpc.mockResolvedValue({ data: null, error: new Error('função não existe') });
    const b = wrap(<Sidebar open={false} onClose={() => {}} />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(b.container.querySelector('.sidebar__count')).toBeNull();
  });
});

describe('fotos de progresso', () => {
  it('assina as fotos do Storage e mantém as antigas (base64)', async () => {
    mockSign.mockResolvedValue({ data: [{ path: 'u1/a.jpg', signedUrl: 'https://signed/a' }, { path: 'u1/b.jpg', signedUrl: null }] });
    const out = await withSignedPhotos([
      { id: 1, storage_path: 'u1/a.jpg', image_data: null },
      { id: 2, storage_path: 'u1/b.jpg', image_data: null },
      { id: 3, storage_path: null, image_data: 'data:x' },
    ]);
    expect(out.map(p => p.image_data)).toEqual(['https://signed/a', null, 'data:x']);
    expect(mockSign).toHaveBeenCalledWith(['u1/a.jpg', 'u1/b.jpg'], 3600);
  });

  it('falha ao assinar não derruba a tela; sem fotos não chama o Storage', async () => {
    mockSign.mockRejectedValue(new Error('403'));
    expect((await withSignedPhotos([{ id: 1, storage_path: 'p', image_data: null }]))[0].image_data).toBeNull();
    mockSign.mockClear();
    expect(await withSignedPhotos(null)).toEqual([]);
    expect(mockSign).not.toHaveBeenCalled();
  });
});

describe('correção de treino', () => {
  it('parseSetNumber aceita vírgula e vazio, recusa negativo e texto', () => {
    expect(parseSetNumber('82,5')).toEqual({ ok: true, value: 82.5 });
    expect(parseSetNumber('')).toEqual({ ok: true, value: null });
    expect(parseSetNumber('-1').ok).toBe(false);
    expect(parseSetNumber('abc').ok).toBe(false);
    expect(parseSetNumber('5000').ok).toBe(false);
  });

  it('fixWorkoutSet grava e registra o antes e o depois na auditoria', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(t => (t === 'exercise_sets' ? { update } : { insert }));
    await fixWorkoutSet({ id: 's1', exercise_name: 'Supino', set_number: 2, carga: 800, reps: 8 }, { carga: 80, reps: 8 }, 'adm1', 'u1');
    expect(update.mock.calls[0][0]).toMatchObject({ carga: 80, reps: 8 });
    expect(eq).toHaveBeenCalledWith('id', 's1');
    expect(insert).toHaveBeenCalledWith({
      admin_id: 'adm1', target_user_id: 'u1', action: 'fixWorkoutSet',
      details: { exercise: 'Supino', set: 2, from: { carga: 800, reps: 8 }, to: { carga: 80, reps: 8 } },
    });
  });

  it('deleteWorkout apaga e audita; erro não audita', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    let result = { error: null };
    mockFrom.mockImplementation(t => (t === 'workouts' ? { delete: () => ({ eq: () => Promise.resolve(result) }) } : { insert }));
    await deleteWorkout({ id: 'w1', workout_date: '2026-10-07', day_of_week: 'Quarta' }, 'adm1', 'u1');
    expect(insert).toHaveBeenCalledTimes(1);
    result = { error: new Error('rls') };
    await expect(deleteWorkout({ id: 'w1' }, 'adm1', 'u1')).rejects.toThrow('rls');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('UserWorkoutsTab: corrige uma série e apaga um treino', async () => {
    const onFixSet = vi.fn().mockResolvedValue();
    const onDeleteWorkout = vi.fn();
    const workout = { id: 'w1', workout_date: '2026-10-07', day_of_week: 'Quarta', completed: true, duration_seconds: 1800 };
    const set = { id: 's1', exercise_name: 'Supino', set_number: 1, carga: 800, reps: 8, completed: true };
    render(<UserWorkoutsTab
      activePlan={null} workouts={[workout]} expandedWorkoutId="w1" workoutSets={{ w1: [set] }} setsLoading={false}
      onToggleWorkoutDetail={() => {}} onExportTreinos={() => {}} personalRecords={[]} discomfortLogs={[]}
      onFixSet={onFixSet} onDeleteWorkout={onDeleteWorkout}
    />);
    fireEvent.click(screen.getByText('Corrigir'));
    fireEvent.change(screen.getByLabelText('Carga'), { target: { value: 'oitenta' } });
    expect(screen.getByText('Salvar').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Carga'), { target: { value: '80' } });
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(onFixSet).toHaveBeenCalledWith('w1', set, { carga: 80, reps: 8 }));
    fireEvent.click(screen.getByText('Apagar treino'));
    expect(onDeleteWorkout).toHaveBeenCalledWith(workout);
  });

  it('UserWorkoutsTab sem as ações de suporte não mostra os botões', () => {
    render(<UserWorkoutsTab
      activePlan={null} workouts={[{ id: 'w1', workout_date: '2026-10-07', day_of_week: 'Quarta' }]} expandedWorkoutId="w1"
      workoutSets={{ w1: [{ id: 's1', exercise_name: 'Supino', set_number: 1, carga: 80, reps: 8 }] }} setsLoading={false}
      onToggleWorkoutDetail={() => {}} onExportTreinos={() => {}} personalRecords={[]} discomfortLogs={[]}
    />);
    expect(screen.queryByText('Corrigir')).toBeNull();
    expect(screen.queryByText('Apagar treino')).toBeNull();
  });
});

describe('aviso do app com período', () => {
  it('bannerWindow', () => {
    expect(bannerWindow({ startsOn: '2026-10-10', endsOn: '' }, '2026-10-08')).toBe('agendado');
    expect(bannerWindow({ startsOn: '', endsOn: '2026-10-07' }, '2026-10-08')).toBe('encerrado');
    expect(bannerWindow({ startsOn: '2026-10-08', endsOn: '2026-10-08' }, '2026-10-08')).toBe('no_ar');
    expect(bannerWindow({ startsOn: '', endsOn: '' }, '2026-10-08')).toBe('no_ar');
  });

  it('lê as datas (descarta inválidas) e mudar só o período não reabre o aviso', () => {
    const s = normalizeSettings([{ key: 'banner', value: { enabled: true, message: 'A', startsOn: '2026-10-10', endsOn: 'depois' } }]);
    expect(s.banner).toMatchObject({ startsOn: '2026-10-10', endsOn: '' });
    const cur = { enabled: true, message: 'A', level: 'info', linkUrl: '', linkLabel: '', startsOn: '', endsOn: '', version: 4 };
    expect(nextBannerVersion(cur, { ...cur, endsOn: '2026-10-20' })).toBe(4);
  });
});

describe('limpeza de dados antigos', () => {
  it('fetchPurgeStats rotula os tipos e purgeOld devolve o total apagado', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ pg_kind: 'page_visits', pg_total: '900', pg_old: '300' }, { pg_kind: 'novo_tipo', pg_total: 1, pg_old: 0 }], error: null });
    expect(await fetchPurgeStats()).toEqual([
      { kind: 'page_visits', label: 'Visitas à landing e à tela de acesso', total: 900, old: 300 },
      { kind: 'novo_tipo', label: 'novo_tipo', total: 1, old: 0 },
    ]);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_purge_stats', { p_days: 180 });
    mockRpc.mockResolvedValueOnce({ data: 300, error: null });
    expect(await purgeOld('page_visits')).toBe(300);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_purge_old', { p_kind: 'page_visits', p_days: 180 });
  });
});

describe('exportação dos dados do usuário', () => {
  it('junta as seções e avisa as que falharam, sem derrubar o arquivo', async () => {
    mockFrom.mockImplementation(table => {
      const result = table === 'feedback' ? { data: null, error: new Error('rls') }
        : table === 'workouts' ? { data: [{ id: 'w1', workout_date: '2026-10-07' }], error: null }
          : { data: [{ from: table }], error: null };
      return {
        select: () => ({
          eq: () => ({ order: () => Promise.resolve(result) }),
          in: () => Promise.resolve(result),
        }),
      };
    });
    const out = await gatherUserExport('u1', { email: 'a@x.com', created_at: 'c', user_metadata: { nome: 'Ana' } });
    expect(out.profile).toEqual({ email: 'a@x.com', createdAt: 'c', nome: 'Ana' });
    expect(out.workouts).toHaveLength(1);
    expect(out.exerciseSets).toEqual([{ from: 'exercise_sets' }]);
    expect(out.dailyCheckins).toEqual([{ from: 'daily_checkins' }]);
    expect(out.feedback).toEqual([]);
    expect(out.incomplete).toEqual(['feedback']);
  });
});

describe('UserFriendsCard', () => {
  const rows = [{ uf_id: 7, uf_other: 'u2', uf_email: 'bia@x.com', uf_name: 'Bia', uf_status: 'friend', uf_since: '2026-09-01T12:00:00Z' }];

  it('lista as amizades e remove após confirmar', async () => {
    mockRpc.mockImplementation(async name => (name === 'admin_user_friendships' ? { data: rows, error: null } : { error: null }));
    wrap(<UserFriendsCard userId="u1" />);
    expect(await screen.findByText('Bia')).toBeTruthy();
    expect(screen.getByText('amigos')).toBeTruthy();
    fireEvent.click(screen.getByText('Remover'));
    expect(await screen.findByText('Vínculo removido.')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_remove_friendship', { p_id: 7 });
  });

  it('sem amizades ou com erro não mostra nada', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const a = wrap(<UserFriendsCard userId="u1" />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(a.container.textContent).toBe('');
    a.unmount();
    mockRpc.mockResolvedValue({ data: null, error: new Error('x') });
    const b = wrap(<UserFriendsCard userId="u1" />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(b.container.textContent).toBe('');
  });
});
