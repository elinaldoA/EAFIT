import { db } from './supabase';

const ERRORS = {
  not_authorized: 'Sem permissão para essa ação.',
  invalid_name: 'Dê um nome ao modelo (2 a 60 letras).',
  invalid_days: 'O treino precisa de 1 a 7 dias.',
  invalid_exercises: 'Cada dia precisa de 1 a 20 exercícios, todos com nome.',
  invalid_duration: 'Duração inválida.',
  too_many_templates: 'Você atingiu o limite de 50 modelos. Apague algum para salvar outro.',
  no_recipients: 'Nenhum dos alunos escolhidos está vinculado a você.',
  too_many_recipients: 'Escolha no máximo 50 alunos por envio.',
};

export function friendlyTemplateError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : 'Não foi possível concluir. Tente de novo.';
}

// Resumo de um modelo: "3 dias · 17 exercícios".
export function templateSummary(template) {
  const days = template.days || [];
  const exercises = days.reduce((n, d) => n + (d.exercicios || []).length, 0);
  const weeks = template.weeks ? ` · ${template.weeks} semanas` : '';
  return `${days.length} dia(s) · ${exercises} exercício(s)${weeks}`;
}

// Formato que draftFromPlan (lib/trainerPlan) entende.
export function templateToPlan(template) {
  return { name: template.name, duration_weeks: template.weeks, days: template.days };
}

export async function fetchTemplates() {
  const { data, error } = await db.rpc('trainer_templates');
  if (error) throw error;
  return (data || []).map(r => ({ id: r.tpl_id, name: r.tpl_name, weeks: r.tpl_weeks, days: r.tpl_days || [], at: r.tpl_at }));
}

export async function saveTemplate(payload) {
  const { data, error } = await db.rpc('trainer_save_template', {
    p_name: payload.name, p_days: payload.days, p_weeks: payload.weeks,
  });
  if (error) throw error;
  return data;
}

export async function deleteTemplate(id) {
  const { error } = await db.rpc('trainer_delete_template', { p_id: id });
  if (error) throw error;
}

// Envia o treino a vários alunos; devolve os ids que receberam.
export async function assignPlanBulk(clientIds, payload) {
  const { data, error } = await db.rpc('trainer_assign_plan_bulk', {
    p_clients: clientIds, p_name: payload.name, p_days: payload.days, p_duration_weeks: payload.weeks,
  });
  if (error) throw error;
  return data || [];
}
