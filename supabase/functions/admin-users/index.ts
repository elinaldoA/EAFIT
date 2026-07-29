// API do backoffice pra ações que só a GoTrue Admin API resolve (banir,
// resetar senha, excluir conta de terceiros, editar metadata de terceiros) —
// nada disso é alcançável via PostgREST/RLS. Mesmo padrão de
// delete-account/index.ts: cliente anon com o JWT de quem chamou pra
// identificar o admin, cliente service role pra agir. Diferente dele, aqui
// SEMPRE se confirma antes que quem chamou é admin (profiles.is_admin).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function logAudit(admin: ReturnType<typeof createClient>, adminId: string, targetUserId: string | null, action: string, details: unknown) {
  await admin.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: targetUserId, action, details });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return json({ error: 'Não autenticado.' }, 401);
  }
  const callerId = userRes.user.id;

  const { data: profile, error: profileErr } = await callerClient
    .from('profiles')
    .select('is_admin')
    .eq('id', callerId)
    .single();
  if (profileErr || !profile?.is_admin) {
    return json({ error: 'Acesso negado.' }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const { action, targetUserId } = body as { action?: string; targetUserId?: string };
  if (!action || !targetUserId) {
    return json({ error: 'Faltam "action" e "targetUserId".' }, 400);
  }

  try {
    switch (action) {
      case 'ban': {
        const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '876000h' });
        if (error) throw error;
        await logAudit(admin, callerId, targetUserId, 'ban', null);
        return json({ ok: true });
      }

      case 'unban': {
        const { error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
        if (error) throw error;
        await logAudit(admin, callerId, targetUserId, 'unban', null);
        return json({ ok: true });
      }

      case 'confirmUser': {
        const { error } = await admin.auth.admin.updateUserById(targetUserId, { email_confirm: true });
        if (error) throw error;
        await logAudit(admin, callerId, targetUserId, 'confirmUser', null);
        return json({ ok: true });
      }

      case 'resetPassword': {
        const { data: target, error: getErr } = await admin.auth.admin.getUserById(targetUserId);
        if (getErr || !target?.user?.email) throw getErr || new Error('Usuário sem e-mail.');
        const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email: target.user.email,
        });
        if (linkErr) throw linkErr;
        await logAudit(admin, callerId, targetUserId, 'resetPassword', null);
        return json({ ok: true, actionLink: link.properties?.action_link });
      }

      case 'updateProfile': {
        const fields = (body.fields as Record<string, unknown>) || {};
        const { data: target, error: getErr } = await admin.auth.admin.getUserById(targetUserId);
        if (getErr || !target?.user) throw getErr || new Error('Usuário não encontrado.');
        const mergedMetadata = { ...(target.user.user_metadata || {}), ...fields };
        const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, { user_metadata: mergedMetadata });
        if (updErr) throw updErr;
        await logAudit(admin, callerId, targetUserId, 'updateProfile', fields);
        return json({ ok: true });
      }

      case 'deleteUser': {
        const { data: workouts, error: wErr } = await admin.from('workouts').select('id').eq('user_id', targetUserId);
        if (wErr) throw wErr;
        const workoutIds = (workouts || []).map((w) => w.id);
        if (workoutIds.length) {
          const { error } = await admin.from('exercise_sets').delete().in('workout_id', workoutIds);
          if (error) throw error;
          const { error: logErr } = await admin.from('exercise_logs').delete().in('workout_id', workoutIds);
          if (logErr) throw logErr;
        }
        const { error: delWorkoutsErr } = await admin.from('workouts').delete().eq('user_id', targetUserId);
        if (delWorkoutsErr) throw delWorkoutsErr;

        const { data: plans, error: pErr } = await admin.from('workout_plans').select('id').eq('user_id', targetUserId);
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
        const { error: delPlansErr } = await admin.from('workout_plans').delete().eq('user_id', targetUserId);
        if (delPlansErr) throw delPlansErr;

        const directTables = [
          'progress_photos', 'water_logs',
          'weight_logs', 'achievements', 'push_subscriptions',
          'exercise_discomfort', 'personal_records',
        ];
        for (const table of directTables) {
          const { error } = await admin.from(table).delete().eq('user_id', targetUserId);
          if (error) throw error;
        }

        const { data: files, error: listErr } = await admin.storage.from('progress-photos').list(targetUserId);
        if (listErr) throw listErr;
        if (files?.length) {
          const { error: removeErr } = await admin.storage.from('progress-photos').remove(files.map((f) => `${targetUserId}/${f.name}`));
          if (removeErr) throw removeErr;
        }

        const { error: profileDelErr } = await admin.from('profiles').delete().eq('id', targetUserId);
        if (profileDelErr) throw profileDelErr;

        const { error: authErr } = await admin.auth.admin.deleteUser(targetUserId);
        if (authErr) throw authErr;

        await logAudit(admin, callerId, targetUserId, 'deleteUser', null);
        return json({ ok: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    console.error('admin-users error:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
