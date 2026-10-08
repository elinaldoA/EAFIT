// Apaga todos os dados de treino/perfil de um usuário (tabelas filhas antes
// das pais, por causa das FKs sem cascade — ver comentário do baseline
// schema). Usado tanto por delete-account (o próprio usuário se excluindo)
// quanto por admin-users/deleteUser (admin excluindo terceiro), pra nunca
// mais divergir sobre quais tabelas são limpas entre os dois fluxos.
// Não apaga a conta de auth em si — quem chama decide isso depois, já que
// delete-account e admin-users tratam esse passo de formas ligeiramente
// diferentes (self-service vs. admin).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Tabelas apagadas por coluna do usuário, filhas antes das pais. A maioria também
// tem on delete cascade para auth.users — a lista é explícita de propósito: a
// exclusão não depende de cada FK ter sido criada com cascade (já houve tabela
// que não tinha) e fica claro, num lugar só, tudo que guarda dado de pessoa.
// Quem é aluno E personal tem as duas colunas (trainer_id/client_id) limpas.
// app-react/src/data/userDataTables.test.js confere esta lista contra as
// migrations: tabela nova com FK para o usuário precisa entrar aqui (ou na
// lista de exceções do teste, com o motivo).
const USER_COLUMNS: [table: string, column: string][] = [
  ['progress_photos', 'user_id'], ['water_logs', 'user_id'],
  ['weight_logs', 'user_id'], ['achievements', 'user_id'], ['push_subscriptions', 'user_id'],
  ['exercise_discomfort', 'user_id'], ['body_measurements', 'user_id'], ['daily_checkins', 'user_id'],
  ['challenge_members', 'user_id'],
  ['feed_reactions', 'user_id'], ['feed_events', 'user_id'], ['friend_profiles', 'user_id'],
  ['friendships', 'requester_id'], ['friendships', 'addressee_id'],
  ['feedback', 'user_id'], ['user_notifications', 'user_id'], ['notification_log', 'user_id'],
  ['client_errors', 'user_id'], ['admin_user_notes', 'user_id'],
  ['user_events', 'user_id'], ['user_client', 'user_id'],
  ['appointment_reminder_log', 'recipient'],
  ['trainer_appointments', 'client_id'], ['trainer_appointments', 'trainer_id'],
  ['trainer_alert_log', 'client_id'], ['trainer_alert_log', 'trainer_id'],
  ['trainer_messages', 'client_id'], ['trainer_messages', 'trainer_id'],
  ['trainer_notes', 'client_id'], ['trainer_notes', 'trainer_id'],
  ['trainer_goals', 'client_id'], ['trainer_goals', 'trainer_id'],
  ['trainer_clients', 'client_id'], ['trainer_clients', 'trainer_id'],
  ['trainer_templates', 'trainer_id'], ['trainer_settings', 'trainer_id'],
  ['trainers', 'user_id'],
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

  for (const [table, column] of USER_COLUMNS) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) throw error;
  }

  // O registro de auditoria fica (é do admin), mas o conteúdo das ações sobre
  // esta pessoa (ex.: campos de perfil editados) é dado pessoal: limpa.
  const { error: auditErr } = await admin.from('admin_audit_log').update({ details: null }).eq('target_user_id', userId);
  if (auditErr) throw auditErr;

  const { data: files, error: listErr } = await admin.storage.from('progress-photos').list(userId);
  if (listErr) throw listErr;
  if (files?.length) {
    const { error: removeErr } = await admin.storage.from('progress-photos').remove(files.map((f) => `${userId}/${f.name}`));
    if (removeErr) throw removeErr;
  }

  const { error: profileErr } = await admin.from('profiles').delete().eq('id', userId);
  if (profileErr) throw profileErr;
}
