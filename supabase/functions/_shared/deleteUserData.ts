// Apaga todos os dados de treino/perfil de um usuário (tabelas filhas antes
// das pais, por causa das FKs sem cascade — ver comentário do baseline
// schema). Usado tanto por delete-account (o próprio usuário se excluindo)
// quanto por admin-users/deleteUser (admin excluindo terceiro), pra nunca
// mais divergir sobre quais tabelas são limpas entre os dois fluxos.
// Não apaga a conta de auth em si — quem chama decide isso depois, já que
// delete-account e admin-users tratam esse passo de formas ligeiramente
// diferentes (self-service vs. admin).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const DIRECT_USER_TABLES = [
  'progress_photos', 'water_logs',
  'weight_logs', 'achievements', 'push_subscriptions',
  'exercise_discomfort',
];

export async function deleteUserData(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: workouts, error: wErr } = await admin.from('workouts').select('id').eq('user_id', userId);
  if (wErr) throw wErr;
  const workoutIds = (workouts || []).map((w) => w.id);
  if (workoutIds.length) {
    const { error } = await admin.from('exercise_sets').delete().in('workout_id', workoutIds);
    if (error) throw error;
    const { error: logErr } = await admin.from('exercise_logs').delete().in('workout_id', workoutIds);
    if (logErr) throw logErr;
  }
  const { error: delWorkoutsErr } = await admin.from('workouts').delete().eq('user_id', userId);
  if (delWorkoutsErr) throw delWorkoutsErr;

  const { data: plans, error: pErr } = await admin.from('workout_plans').select('id').eq('user_id', userId);
  if (pErr) throw pErr;
  const planIds = (plans || []).map((p) => p.id);
  if (planIds.length) {
    const { data: days, error: dErr } = await admin.from('plan_days').select('id').in('plan_id', planIds);
    if (dErr) throw dErr;
    const dayIds = (days || []).map((d) => d.id);
    if (dayIds.length) {
      const { error } = await admin.from('plan_exercises').delete().in('plan_day_id', dayIds);
      if (error) throw error;
    }
    const { error: delDaysErr } = await admin.from('plan_days').delete().in('plan_id', planIds);
    if (delDaysErr) throw delDaysErr;
  }
  const { error: delPlansErr } = await admin.from('workout_plans').delete().eq('user_id', userId);
  if (delPlansErr) throw delPlansErr;

  for (const table of DIRECT_USER_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) throw error;
  }

  const { data: files, error: listErr } = await admin.storage.from('progress-photos').list(userId);
  if (listErr) throw listErr;
  if (files?.length) {
    const { error: removeErr } = await admin.storage.from('progress-photos').remove(files.map((f) => `${userId}/${f.name}`));
    if (removeErr) throw removeErr;
  }

  const { error: profileErr } = await admin.from('profiles').delete().eq('id', userId);
  if (profileErr) throw profileErr;
}
