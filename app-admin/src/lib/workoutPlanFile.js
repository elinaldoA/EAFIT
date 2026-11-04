import { db } from './supabase';

// Arquivo de plano de treino: JSON versionado, o mesmo para exportar de um
// usuário e importar em outro. O painel só lê/grava planos — nada de histórico.
export const PLAN_FILE_KIND = 'eafit-workout-plan';
export const PLAN_FILE_VERSION = 1;
export const MAX_PLAN_FILE_BYTES = 1024 * 1024;
const MAX_DAYS = 14;
const MAX_EXERCISES = 60;

const str = (v, max = 120) => (v === null || v === undefined ? '' : String(v)).trim().slice(0, max);

function cleanExercise(ex, withExtras) {
  const nome = str(ex?.nome);
  if (!nome) return null;
  const out = { nome, series: str(ex.series, 20), reps: str(ex.reps, 40), descanso: str(ex.descanso, 40), tecnica: str(ex.tecnica, 200) };
  if (withExtras) {
    const grupo = str(ex.grupo, 1).toUpperCase();
    out.grupo = /^[A-Z]$/.test(grupo) ? grupo : null;
    const warm = ex.aquecimento === null || ex.aquecimento === undefined || ex.aquecimento === '' ? NaN : Number(ex.aquecimento);
    out.aquecimento = Number.isInteger(warm) && warm >= 0 && warm <= 3 ? warm : null;
  }
  return out;
}

// Plano ativo (formato do UserDetail: plan_days[].plan_exercises[]) -> objeto do arquivo.
export function buildPlanExport(plan) {
  return {
    kind: PLAN_FILE_KIND,
    version: PLAN_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    name: plan.name || 'Plano',
    durationWeeks: plan.duration_weeks ?? null,
    days: (plan.plan_days || []).map(d => {
      const list = d.plan_exercises || [];
      return {
        dia: d.dia,
        foco: d.foco ?? '',
        exercicios: list.filter(e => !e.is_post_workout).map(e => cleanExercise(e, true)).filter(Boolean),
        pos: list.filter(e => e.is_post_workout).map(e => cleanExercise(e, false)).filter(Boolean),
      };
    }),
  };
}

export function downloadPlanFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Texto do arquivo -> { plan: { name, durationWeeks, days } } ou { error }.
// Valida e normaliza: o conteúdo vem de fora, nunca é gravado como está.
export function parsePlanFile(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { error: 'O arquivo não é um JSON válido.' }; }
  if (!raw || raw.kind !== PLAN_FILE_KIND) return { error: 'Este arquivo não é um plano de treino exportado pelo painel.' };
  if (raw.version !== PLAN_FILE_VERSION) return { error: 'Versão do arquivo não suportada.' };
  if (!Array.isArray(raw.days) || raw.days.length === 0) return { error: 'O plano não tem nenhum dia.' };
  if (raw.days.length > MAX_DAYS) return { error: `O plano tem dias demais (máximo ${MAX_DAYS}).` };

  const days = [];
  for (const d of raw.days) {
    const dia = str(d?.dia, 40);
    if (!dia) return { error: 'Há um dia sem nome no arquivo.' };
    const exercicios = (Array.isArray(d.exercicios) ? d.exercicios : []).map(e => cleanExercise(e, true)).filter(Boolean);
    const pos = (Array.isArray(d.pos) ? d.pos : []).map(e => cleanExercise(e, false)).filter(Boolean);
    if (exercicios.length + pos.length > MAX_EXERCISES) return { error: `O dia "${dia}" tem exercícios demais (máximo ${MAX_EXERCISES}).` };
    days.push({ dia, foco: str(d.foco, 80), exercicios, pos });
  }
  const weeks = Number(raw.durationWeeks);
  return {
    plan: {
      name: str(raw.name, 80) || 'Plano importado',
      durationWeeks: Number.isInteger(weeks) && weeks > 0 && weeks <= 52 ? weeks : null,
      days,
    },
  };
}

export function summarizePlan(plan) {
  return {
    days: plan.days.length,
    exercises: plan.days.reduce((n, d) => n + d.exercicios.length + d.pos.length, 0),
  };
}

// Cria o plano para o usuário (RPC transacional; o admin passa pela policy
// "admin full access") e registra na auditoria.
export async function importPlanForUser(userId, plan, { activate, adminId }) {
  const today = new Date();
  const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { error } = await db.rpc('create_workout_plan', {
    p_user_id: userId,
    p_name: plan.name,
    p_days: plan.days,
    p_activate: activate,
    p_start_date: activate && plan.durationWeeks ? start : null,
    p_duration_weeks: activate ? plan.durationWeeks : null,
  });
  if (error) throw error;
  const { error: auditErr } = await db.from('admin_audit_log').insert({
    admin_id: adminId, target_user_id: userId, action: 'importWorkoutPlan',
    details: { name: plan.name, activated: activate, ...summarizePlan(plan) },
  });
  if (auditErr) console.error('audit log:', auditErr.message);
}

export async function logPlanExport(userId, adminId, name) {
  const { error } = await db.from('admin_audit_log').insert({
    admin_id: adminId, target_user_id: userId, action: 'exportWorkoutPlan', details: { name },
  });
  if (error) console.error('audit log:', error.message);
}
