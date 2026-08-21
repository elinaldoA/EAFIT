// Gera e ativa um treino novo pra um usuário específico, a pedido de um
// admin (ex.: suporte). Mesmo padrão de auth de admin-users/index.ts.
//
// A lógica de ajuste por IMC/nível (computeImcBracket, applyImcAdjustment,
// applyLevelAdjustment) mora em ../_shared/workoutAdjustments.ts — ver o
// comentário lá sobre por que é um PORT duplicado de
// app-react/src/data/workoutAdjustments.js.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { computeImcBracket, applyImcAdjustment, applyLevelAdjustment, type Day } from '../_shared/workoutAdjustments.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------- escrita no banco (port de app-react/src/lib/workoutPlans.js) ----------

function exercisesToRows(planDayId: string, day: Day) {
  return [
    ...day.exercicios.map((ex, idx) => ({
      plan_day_id: planDayId, nome: ex.nome, series: ex.series, reps: ex.reps,
      descanso: ex.descanso, tecnica: ex.tecnica, is_post_workout: false, order_index: idx,
    })),
    ...day.pos.map((p, idx) => ({
      plan_day_id: planDayId, nome: p.nome, series: p.series, reps: p.reps,
      descanso: p.descanso, tecnica: p.tecnica, is_post_workout: true, order_index: idx,
    })),
  ];
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'Não autenticado.' }, 401);
  const callerId = userRes.user.id;

  const { data: profile, error: profileErr } = await callerClient
    .from('profiles').select('is_admin').eq('id', callerId).single();
  if (profileErr || !profile?.is_admin) return json({ error: 'Acesso negado.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  const { targetUserId, kind } = body as { targetUserId?: string; kind?: string };
  if (!targetUserId || kind !== 'workout') {
    return json({ error: 'Faltam "targetUserId" e "kind" ("workout").' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: targetRes, error: targetErr } = await admin.auth.admin.getUserById(targetUserId);
    if (targetErr || !targetRes?.user) throw targetErr || new Error('Usuário não encontrado.');
    const md = targetRes.user.user_metadata || {};
    const peso = parseFloat(md.peso);
    const altura = parseFloat(md.altura);
    const meta = md.meta || 'saude';
    const nivel = md.nivel || 'intermediario';

    if (!(peso > 0) || !(altura > 0)) {
      return json({ error: 'Este usuário ainda não completou o perfil (peso/altura).' }, 400);
    }

    const { data: tpl, error: tplErr } = await admin
      .from('workout_templates').select('days').eq('meta', meta).single();
    if (tplErr || !tpl?.days) throw tplErr || new Error('Template não encontrado.');

    const leveled = applyLevelAdjustment(tpl.days as Day[], nivel);
    const bracket = computeImcBracket(peso, altura);
    const generatedDays = applyImcAdjustment(leveled, bracket);

    const { data: plan, error: planErr } = await admin
      .from('workout_plans')
      .insert({ user_id: targetUserId, name: `Plano gerado pelo admin (${new Date().toLocaleDateString('pt-BR')})`, is_active: false })
      .select().single();
    if (planErr) throw planErr;

    for (let i = 0; i < generatedDays.length; i++) {
      const day = generatedDays[i];
      const { data: planDay, error: dayErr } = await admin
        .from('plan_days')
        .insert({ plan_id: plan.id, dia: day.dia, foco: day.foco, order_index: i })
        .select().single();
      if (dayErr) throw dayErr;

      const rows = exercisesToRows(planDay.id, day);
      if (rows.length) {
        const { error: exErr } = await admin.from('plan_exercises').insert(rows);
        if (exErr) throw exErr;
      }
    }

    const { error: offErr } = await admin.from('workout_plans').update({ is_active: false }).eq('user_id', targetUserId);
    if (offErr) throw offErr;
    const startDate = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
    const { error: onErr } = await admin.from('workout_plans')
      .update({ is_active: true, start_date: startDate, end_date: endDate, duration_weeks: 4 })
      .eq('id', plan.id);
    if (onErr) throw onErr;

    await admin.from('admin_audit_log').insert({ admin_id: callerId, target_user_id: targetUserId, action: 'generateWorkout', details: { meta, nivel } });
    return json({ ok: true, planId: plan.id });
  } catch (err) {
    console.error('admin-generate-plan error:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
