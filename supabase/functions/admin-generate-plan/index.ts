// Gera e ativa um treino novo pra um usuário específico, a pedido de um
// admin (ex.: suporte). Mesmo padrão de auth de admin-users/index.ts.
//
// A lógica de ajuste por IMC/nível abaixo (computeImcBracket até
// applyLevelAdjustment) é um PORT literal de
// app-react/src/data/workoutTemplates.js:169-344 — não há pacote
// compartilhado entre app-react e app-admin neste repo, então a duplicação
// é deliberada (mesmo espírito de _shared/webpush.ts). Se a lógica de lá
// mudar, espelhar aqui também.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ---------- port de workoutTemplates.js (IMC/nível) ----------

type Exercise = { nome: string; series: string; reps: string; descanso: string; tecnica: string };
type Day = { dia: string; foco: string; exercicios: Exercise[]; pos: Exercise[] };

function computeImcBracket(peso: number, altura: number): string {
  const p = parseFloat(String(peso));
  const a = parseFloat(String(altura));
  if (!(p > 0) || !(a > 0)) return 'normal';
  const imc = p / ((a / 100) ** 2);
  if (imc < 18.5) return 'abaixo';
  if (imc < 25) return 'normal';
  if (imc < 30) return 'sobrepeso';
  return 'obesidade';
}

function isRestOrCardioDay(day: Day) {
  return day.foco.includes('Cardio Leve') || day.foco.includes('Descanso');
}

function cloneDay(day: Day): Day {
  return { dia: day.dia, foco: day.foco, exercicios: day.exercicios.map(e => ({ ...e })), pos: day.pos.map(p => ({ ...p })) };
}

function trimCardio(day: Day): Day {
  return { ...day, pos: day.pos.filter(p => !p.nome.startsWith('🏃')) };
}

function ensureCardio(day: Day): Day {
  if (day.pos.some(p => p.nome.startsWith('🏃'))) return day;
  return { ...day, pos: [...day.pos, { nome: '🏃 Cardio — Caminhada ou Bicicleta', series: '-', reps: '20min · Moderado', descanso: '-', tecnica: '' }] };
}

function reduceVolume(day: Day): Day {
  return {
    ...day,
    exercicios: day.exercicios.map(ex => {
      const n = parseInt(ex.series, 10);
      if (!Number.isFinite(n)) return ex;
      return { ...ex, series: String(Math.max(2, n - 1)) };
    }),
  };
}

function lightCardioDay(dia: string): Day {
  return {
    dia,
    foco: 'Cardio Leve / Recuperação',
    exercicios: [{ nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30-40min', descanso: '-', tecnica: '5-6km/h ou 130bpm (baixo impacto)' }],
    pos: [],
  };
}

function applyImcAdjustment(templateDays: Day[], bracket: string): Day[] {
  const days = templateDays.map(cloneDay);

  if (bracket === 'abaixo') {
    return days.map(d => (isRestOrCardioDay(d) ? d : trimCardio(d)));
  }
  if (bracket === 'sobrepeso') {
    return days.map(d => (isRestOrCardioDay(d) ? d : ensureCardio(d)));
  }
  if (bracket === 'obesidade') {
    const trainingIdx = days.map((d, i) => (isRestOrCardioDay(d) ? -1 : i)).filter(i => i >= 0);
    const toDowngrade = new Set(trainingIdx.slice(-2));
    return days.map((d, i) => {
      if (toDowngrade.has(i)) return lightCardioDay(d.dia);
      if (trainingIdx.includes(i)) return reduceVolume(d);
      return d;
    });
  }
  return days;
}

const LEVEL_EXERCISE_SUBS: Record<string, Record<string, { nome: string; tecnica: string }>> = {
  'Supino Reto com Barra': {
    iniciante: { nome: 'Supino Reto na Máquina', tecnica: 'Trajetória guiada, foco na execução' },
    avancado: { nome: 'Supino Reto com Barra (pausa no peito)', tecnica: 'Pausa 1s no peito, sem quicar' },
  },
  'Supino Inclinado com Halteres': {
    iniciante: { nome: 'Supino Inclinado na Máquina', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Supino Inclinado com Halteres (unilateral)', tecnica: 'Um braço por vez, core travado' },
  },
  'Desenvolvimento com Barra': {
    iniciante: { nome: 'Desenvolvimento na Máquina', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Desenvolvimento Militar em Pé', tecnica: 'Sem apoio lombar, core ativo' },
  },
  'Levantamento Terra': {
    iniciante: { nome: 'Levantamento Terra Romeno (barra guiada)', tecnica: 'Amplitude reduzida, foco na técnica' },
    avancado: { nome: 'Levantamento Terra (déficit)', tecnica: 'Pés sobre anteparo, ROM ampliado' },
  },
  'Agachamento Livre': {
    iniciante: { nome: 'Agachamento no Smith', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Agachamento Livre (pausa no fundo)', tecnica: 'Pausa 2s no fundo' },
  },
  'Remada Curvada com Barra': {
    iniciante: { nome: 'Remada Curvada na Máquina', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Remada Curvada com Barra (pegada supinada)', tecnica: 'Pegada supinada, foco lombar' },
  },
  'Puxada Aberta Frente': {
    iniciante: { nome: 'Puxada Aberta Assistida', tecnica: 'Contrapeso reduz o peso corporal' },
    avancado: { nome: 'Barra Fixa (peso corporal)', tecnica: 'Amplitude completa, sem impulso' },
  },
  'Leg Press 45°': {
    avancado: { nome: 'Leg Press 45° (unilateral)', tecnica: 'Uma perna por vez' },
  },
  'Afundo Búlgaro': {
    iniciante: { nome: 'Afundo Estático (sem banco)', tecnica: 'Passada fixa, mais estável' },
    avancado: { nome: 'Afundo Búlgaro (com salto)', tecnica: 'Excêntrica controlada + salto' },
  },
  'Romeno com Barra': {
    iniciante: { nome: 'Romeno com Halteres', tecnica: 'Carga menor, mais controle' },
    avancado: { nome: 'Romeno Unilateral com Halter', tecnica: 'Equilíbrio + core' },
  },
};

const SERIES_DELTA: Record<string, number> = { iniciante: -1, intermediario: 0, avancado: 1 };
const DESCANSO_DELTA_S: Record<string, number> = { iniciante: 15, intermediario: 0, avancado: -15 };

function parseDescansoSeconds(str: string): number | null {
  const min = str.match(/(\d+(?:\.\d+)?)\s*min/);
  if (min) return Math.round(parseFloat(min[1]) * 60);
  const sec = str.match(/(\d+)\s*s/);
  if (sec) return parseInt(sec[1], 10);
  return null;
}

function formatDescansoSeconds(s: number): string {
  if (s >= 120 && s % 60 === 0) return `${s / 60}min`;
  return `${s}s`;
}

function adjustSeries(series: string, delta: number): string {
  const n = parseInt(series, 10);
  if (!Number.isFinite(n) || !delta) return series;
  return String(Math.min(6, Math.max(2, n + delta)));
}

function adjustDescanso(descanso: string, deltaSeconds: number): string {
  const s = parseDescansoSeconds(descanso);
  if (s === null || !deltaSeconds) return descanso;
  return formatDescansoSeconds(Math.max(30, s + deltaSeconds));
}

function applyLevelToExercise(ex: Exercise, nivel: string, allowSub: boolean): Exercise {
  const sub = allowSub ? LEVEL_EXERCISE_SUBS[ex.nome]?.[nivel] : null;
  const seriesDelta = SERIES_DELTA[nivel] ?? 0;
  const descansoDelta = DESCANSO_DELTA_S[nivel] ?? 0;
  return {
    ...ex,
    nome: sub?.nome ?? ex.nome,
    tecnica: sub?.tecnica ?? ex.tecnica,
    series: ex.series === '-' ? ex.series : adjustSeries(ex.series, seriesDelta),
    descanso: ex.descanso === '-' ? ex.descanso : adjustDescanso(ex.descanso, descansoDelta),
  };
}

function applyLevelAdjustment(templateDays: Day[], nivel?: string): Day[] {
  if (!nivel || nivel === 'intermediario') return templateDays.map(cloneDay);
  return templateDays.map(day => {
    if (isRestOrCardioDay(day)) return cloneDay(day);
    return {
      dia: day.dia,
      foco: day.foco,
      exercicios: day.exercicios.map(ex => applyLevelToExercise(ex, nivel, true)),
      pos: day.pos.map(ex => (ex.nome.startsWith('🏃') ? { ...ex } : applyLevelToExercise(ex, nivel, false))),
    };
  });
}

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
