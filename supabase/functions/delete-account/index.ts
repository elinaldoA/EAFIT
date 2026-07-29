// Apaga de fato todos os dados do usuário autenticado e a própria conta de
// login. Roda com o JWT do usuário (verify_jwt padrão do Supabase) só para
// identificar quem está chamando; as exclusões em si usam a service role
// porque tabelas filhas (exercise_sets, plan_days, plan_exercises) não têm
// user_id direto e dependem de deletar via os ids do pai.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401 });
  }
  const userId = userRes.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
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

    const directTables = [
      'progress_photos', 'water_logs',
      'weight_logs', 'achievements', 'push_subscriptions',
    ];
    for (const table of directTables) {
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

    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('delete-account error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500 });
  }
});
