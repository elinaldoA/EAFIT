import { db } from './supabase';

// Arquivo com os dados de UM usuário, para atender pedido de acesso ou
// portabilidade (LGPD). Mesmo espírito do backup que a própria pessoa baixa no
// app (app-react/src/lib/exportData.js), mas lido com o acesso de admin.
//
// Cada seção é independente: se uma falhar, o arquivo sai sem ela e o nome da
// seção volta em `incomplete`, para o admin saber que faltou.
//
// Ficam de fora, de propósito: fotos (o arquivo fica no Storage; vai só a data
// e a nota), recados e notas do personal (são do personal) e dados técnicos
// do aparelho.
const BY_USER = [
  ['workouts', 'workouts', 'id, workout_date, day_of_week, completed, notes, rating, started_at, finished_at, duration_seconds', 'workout_date'],
  ['workoutPlans', 'workout_plans', 'id, name, is_active, start_date, end_date, created_at', 'created_at'],
  ['weightLogs', 'weight_logs', 'log_date, weight, notes', 'log_date'],
  ['waterLogs', 'water_logs', 'log_date, amount_ml', 'log_date'],
  ['bodyMeasurements', 'body_measurements', 'measured_on, cintura, quadril, peito, braco, coxa', 'measured_on'],
  ['dailyCheckins', 'daily_checkins', 'checkin_date, energy, sleep, mood', 'checkin_date'],
  ['discomfortReports', 'exercise_discomfort', 'log_date, exercise_name, severity, note', 'log_date'],
  ['achievements', 'achievements', 'badge_id, unlocked_at', 'unlocked_at'],
  ['progressPhotos', 'progress_photos', 'photo_date, note', 'photo_date'],
  ['feedback', 'feedback', 'kind, message, created_at, admin_reply, replied_at', 'created_at'],
];

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Linhas filhas em lotes (o filtro .in() tem limite de tamanho na URL).
async function byParent(table, columns, parentColumn, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    out.push(...await rows(db.from(table).select(columns).in(parentColumn, ids.slice(i, i + 200))));
  }
  return out;
}

export async function gatherUserExport(userId, detail) {
  const incomplete = [];
  const safe = async (name, fn) => {
    try { return await fn(); } catch { incomplete.push(name); return []; }
  };

  const data = {};
  await Promise.all(BY_USER.map(async ([key, table, columns, order]) => {
    data[key] = await safe(key, () => rows(db.from(table).select(columns).eq('user_id', userId).order(order, { ascending: true })));
  }));

  const workoutIds = data.workouts.map(w => w.id);
  const planIds = data.workoutPlans.map(p => p.id);
  const exerciseSets = await safe('exerciseSets', () => byParent(
    'exercise_sets', 'workout_id, exercise_name, set_number, carga, reps, completed, duracao_min, distancia_km', 'workout_id', workoutIds,
  ));
  const planDays = await safe('planDays', () => byParent('plan_days', 'id, plan_id, dia, foco, order_index', 'plan_id', planIds));
  const planExercises = await safe('planExercises', () => byParent(
    'plan_exercises', 'plan_day_id, nome, series, reps, descanso, tecnica, is_post_workout, order_index', 'plan_day_id', planDays.map(d => d.id),
  ));

  return {
    exportedAt: new Date().toISOString(),
    profile: { email: detail?.email, createdAt: detail?.created_at, ...(detail?.user_metadata || {}) },
    ...data,
    exerciseSets, planDays, planExercises,
    incomplete,
  };
}

// Gera e baixa o arquivo. Devolve as seções que ficaram de fora.
export async function downloadUserExport(userId, detail, adminId) {
  const data = await gatherUserExport(userId, detail);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dados_${userId}_${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const { error } = await db.from('admin_audit_log').insert({
    admin_id: adminId, target_user_id: userId, action: 'exportUserData', details: null,
  });
  if (error) console.error('audit log:', error.message);
  return data.incomplete;
}
