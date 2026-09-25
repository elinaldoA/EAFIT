// Gera e ativa um treino novo pra um usuário específico, a pedido de um
// admin (ex.: suporte). Mesmo padrão de auth de admin-users/index.ts.
//
// A lógica de ajuste por IMC/nível (computeImcBracket, applyImcAdjustment,
// applyLevelAdjustment) mora em ../_shared/workoutAdjustments.ts e o sorteio
// de exercícios da biblioteca em ../_shared/exerciseLibrary.ts — ver os
// comentários lá sobre por que são PORTs duplicados de
// app-react/src/data/workoutAdjustments.js e exerciseLibrary.js. A sequência
// template → biblioteca → nível → IMC é a mesma de generatePlan em
// app-react/src/data/workoutTemplates.js.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { computeImcBracket, applyImcAdjustment, applyLevelAdjustment, type Day } from '../_shared/workoutAdjustments.ts';
import { withLibraryExercises, type LibraryClient } from '../_shared/exerciseLibrary.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CYCLE_WEEKS = 4;

// Data de hoje no fuso de Brasília — mesmo critério de todayDate() no app;
// toISOString() (UTC) viraria o dia seguinte a partir das 21:00.
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
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

    const withLibrary = await withLibraryExercises(admin as unknown as LibraryClient, tpl.days as Day[], nivel);
    const leveled = applyLevelAdjustment(withLibrary, nivel);
    const bracket = computeImcBracket(peso, altura);
    const generatedDays = applyImcAdjustment(leveled, bracket);

    // Cria, preenche e ativa o plano numa transação só (RPC de
    // supabase/migrations/20260925020000_atomic_plan_rpcs.sql) — uma falha no
    // meio não deixa plano pela metade nem o usuário sem plano ativo.
    const { data: plan, error: planErr } = await admin.rpc('create_workout_plan', {
      p_user_id: targetUserId,
      p_name: `Plano gerado pelo admin (${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`,
      p_days: generatedDays,
      p_activate: true,
      p_start_date: todayInSaoPaulo(),
      p_duration_weeks: CYCLE_WEEKS,
    });
    if (planErr) throw planErr;

    await admin.from('admin_audit_log').insert({ admin_id: callerId, target_user_id: targetUserId, action: 'generateWorkout', details: { meta, nivel } });
    return json({ ok: true, planId: plan.id });
  } catch (err) {
    console.error('admin-generate-plan error:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
