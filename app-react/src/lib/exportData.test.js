// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Banco falso: cada tabela devolve as linhas de `tables`; rpc devolve `rpcs`.
const state = { tables: {}, rpcs: {}, failTables: new Set(), failRpcs: new Set() };

function chain(table) {
  const c = {
    select: () => c, eq: () => c, in: () => c, gte: () => c, lte: () => c, not: () => c,
    order: () => c, limit: () => c, maybeSingle: () => c,
    then: (resolve, reject) => Promise.resolve(
      state.failTables.has(table)
        ? { data: null, error: new Error('falha ' + table) }
        : { data: state.tables[table] ?? [], error: null },
    ).then(resolve, reject),
  };
  return c;
}

vi.mock('./supabase', () => ({
  db: {
    from: table => chain(table),
    rpc: name => Promise.resolve(
      state.failRpcs.has(name)
        ? { data: null, error: new Error('falha ' + name) }
        : { data: state.rpcs[name] ?? [], error: null },
    ),
    auth: { getUser: () => Promise.resolve({ data: { user: { email: 'a@b.c', created_at: '2026-01-01', user_metadata: { nome: 'Ana', peso: 70 } } }, error: null }) },
    storage: { from: () => ({ createSignedUrls: paths => Promise.resolve({ data: paths.map(p => ({ path: p, signedUrl: `https://signed/${p}` })) }) }) },
  },
}));

import { gatherUserData } from './exportData';

beforeEach(() => {
  state.tables = {
    workouts: [{ id: 'w1', workout_date: '2026-10-01', day_of_week: 'Segunda', completed: true, notes: 'ok', rating: 4 }],
    exercise_sets: [{ workout_id: 'w1', exercise_name: 'Supino', set_number: 1, carga: 80, reps: 8 }],
    exercise_logs: [{ workout_id: 'w1', exercise_name: 'Supino', series: '4', reps: '8-10' }],
    workout_plans: [], plan_days: [], plan_exercises: [],
    progress_photos: [
      { photo_date: '2026-10-02', note: 'novo', storage_path: 'u1/a.jpg', image_data: null },
      { photo_date: '2026-09-01', note: 'antiga', storage_path: null, image_data: 'data:image/jpeg;base64,AAA' },
    ],
    body_measurements: [{ measured_on: '2026-10-01', cintura: '90', quadril: null, peito: null, braco: null, coxa: null }],
    daily_checkins: [{ checkin_date: '2026-10-01', energy: 4, sleep: 3, mood: 5 }],
    feedback: [{ kind: 'elogio', message: 'Muito bom o app', created_at: '2026-10-03', admin_reply: null, replied_at: null }],
    user_notifications: [{ id: 'n1', kind: 'aviso', title: 'Oi', body: 'Texto', created_at: '2026-10-04', read_at: null }],
  };
  state.rpcs = {
    my_challenges: [{ ch_id: 'c1', ch_title: 'Desafio', ch_code: 'ABC', ch_start: '2026-10-01', ch_end: '2026-10-08', ch_members: 3, ch_score: 4, ch_rank: 1 }],
    my_friend_profile: [{ fp_code: 'K7M2QX', fp_share: true }],
    my_friends: [{ fr_id: 'f1', fr_name: 'Bia', fr_status: 'friend', fr_week: 3 }],
    my_trainer: [{ tc_name: 'Carlos', tc_since: '2026-09-01' }],
    my_trainer_goals: [{ goal_weekly: 5, goal_weight: '72', goal_note: 'Foco', goal_at: '2026-09-02' }],
    my_thread: [{ th_id: 1, th_from: 'trainer', th_body: 'Bom treino', th_kind: 'recado', th_at: '2026-10-05' }],
    my_appointments: [{ ap_id: 'a1', ap_client: 'u1', ap_name: 'Eu', ap_trainer: 'Carlos', ap_starts: '2026-10-10T20:00:00Z', ap_duration: 60, ap_place: 'Academia', ap_note: null, ap_status: 'confirmed' }],
  };
  state.failTables = new Set();
  state.failRpcs = new Set();
});

describe('backup completo', () => {
  it('inclui perfil, medidas, check-ins, desafios, amigos, personal, feedback e avisos', async () => {
    const d = await gatherUserData('u1');
    expect(d.profile).toMatchObject({ email: 'a@b.c', nome: 'Ana', peso: 70 });
    expect(d.workouts[0]).toMatchObject({ notes: 'ok', rating: 4 });
    expect(d.workoutExercises).toHaveLength(1);
    expect(d.bodyMeasurements).toEqual([{ measured_on: '2026-10-01', cintura: 90, quadril: null, peito: null, braco: null, coxa: null }]);
    expect(d.dailyCheckins).toHaveLength(1);
    expect(d.challenges[0]).toMatchObject({ title: 'Desafio', rank: 1 });
    expect(d.friendProfile).toEqual({ code: 'K7M2QX', share: true });
    expect(d.friends).toEqual([{ id: 'f1', name: 'Bia', status: 'friend', week: 3 }]);
    expect(d.trainer).toEqual({ name: 'Carlos', since: '2026-09-01' });
    expect(d.trainerGoals).toMatchObject({ weekly: 5, weight: 72 });
    expect(d.trainerMessages[0]).toMatchObject({ from: 'trainer', body: 'Bom treino' });
    expect(d.appointments[0]).toMatchObject({ status: 'confirmed', place: 'Academia' });
    expect(d.feedback[0]).toMatchObject({ kind: 'elogio' });
    expect(d.notifications).toHaveLength(1);
    expect(d.incomplete).toEqual([]);
  });

  it('fotos levam o caminho e o link temporário; as antigas levam a própria imagem', async () => {
    const d = await gatherUserData('u1');
    expect(d.progressPhotos).toEqual([
      { photo_date: '2026-10-02', note: 'novo', storage_path: 'u1/a.jpg', url: 'https://signed/u1/a.jpg' },
      { photo_date: '2026-09-01', note: 'antiga', image_data: 'data:image/jpeg;base64,AAA' },
    ]);
  });

  it('seção extra que falha não derruba o backup e entra em incomplete', async () => {
    state.failTables.add('feedback');
    state.failRpcs.add('my_challenges');
    const d = await gatherUserData('u1');
    expect(d.feedback).toEqual([]);
    expect(d.challenges).toEqual([]);
    expect(d.incomplete.sort()).toEqual(['challenges', 'feedback']);
    expect(d.workouts).toHaveLength(1);
    expect(d.bodyMeasurements).toHaveLength(1);
  });

  it('falha numa seção principal (treinos) continua sendo erro', async () => {
    state.failTables.add('workouts');
    await expect(gatherUserData('u1')).rejects.toThrow();
  });
});
