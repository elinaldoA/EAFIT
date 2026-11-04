import { db } from './supabase';
import { parseWorkoutPlanText, planDaysFromTreinos } from './planTextParser';
import { PlanFileError, readPdfText, readXlsxRows } from './planFileReader';

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
  if (!raw || raw.kind !== PLAN_FILE_KIND) return { error: 'Este JSON não é um plano de treino exportado pelo painel.' };
  if (raw.version !== PLAN_FILE_VERSION) return { error: 'Versão do arquivo não suportada.' };
  return normalizePlan(raw);
}

function normalizePlan(raw) {
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

const FILE_ERRORS = {
  xlsx: 'Não consegui abrir a planilha. Salve de novo como .xlsx ou CSV.',
  xls: 'Esse formato de planilha (.xls, .ods, .numbers) não é lido. Salve como .xlsx ou CSV e tente de novo.',
  image: 'Foto/imagem não é lida no painel. Use PDF com texto, planilha, CSV, TXT ou o JSON exportado.',
  pdf: 'Não consegui ler o PDF.',
};
export const PLAN_FILE_ACCEPT = '.json,.csv,.tsv,.txt,.xlsx,.pdf,application/json,text/csv,text/plain,application/pdf';

const extOf = name => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

// Ficha em texto livre (CSV, TXT, planilha, PDF) -> plano. Mesmo leitor da
// importação do app: "Supino 4x10", Dia A/B/C, dias da semana.
export function planFromText(text, name) {
  const parsed = parseWorkoutPlanText(text);
  if (!parsed) {
    return { error: 'Não encontrei exercícios no arquivo. Cada linha precisa ter o nome e as séries, como “Supino 4x10” (ou colunas de exercício, séries e repetições).' };
  }
  return normalizePlan({ name, days: planDaysFromTreinos(parsed.treinos, 'Descanso') });
}

// Arquivo escolhido -> { plan } ou { error }. Aceita o JSON exportado pelo
// painel, planilha .xlsx, CSV/TSV/TXT e PDF com texto.
export async function readPlanFile(file) {
  if (file.size > MAX_PLAN_FILE_BYTES * 10 && extOf(file.name) !== 'pdf') return { error: 'Arquivo grande demais (máximo 10 MB).' };
  if (file.size > 20 * 1024 * 1024) return { error: 'Arquivo grande demais (máximo 20 MB).' };
  const ext = extOf(file.name);
  const name = String(file.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80) || 'Plano importado';
  try {
    if (ext === 'json' || file.type === 'application/json') {
      if (file.size > MAX_PLAN_FILE_BYTES) return { error: 'Arquivo grande demais (máximo 1 MB).' };
      return parsePlanFile(await file.text());
    }
    if (ext === 'xlsx') {
      const rows = await readXlsxRows(await file.arrayBuffer());
      return planFromText(rows.map(r => r.join('  ')).join('\n'), name);
    }
    if (ext === 'pdf' || file.type === 'application/pdf') {
      const text = await readPdfText(file);
      if (!text.trim()) return { error: 'Esse PDF não tem texto (parece escaneado). Use um PDF com texto, planilha, CSV ou TXT.' };
      return planFromText(text, name);
    }
    if (['xls', 'ods', 'numbers'].includes(ext)) return { error: FILE_ERRORS.xls };
    if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif'].includes(ext)) return { error: FILE_ERRORS.image };
    return planFromText(await file.text(), name);
  } catch (err) {
    if (err instanceof PlanFileError) return { error: FILE_ERRORS[err.code] || 'Não consegui ler o arquivo.' };
    console.error('readPlanFile:', err);
    return { error: ext === 'pdf' ? FILE_ERRORS.pdf : 'Não consegui ler o arquivo.' };
  }
}
