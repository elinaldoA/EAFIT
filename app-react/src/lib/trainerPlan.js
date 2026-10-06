import { db } from './supabase';

export const WEEK_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const DURATION_CHOICES = [
  { value: '', label: 'Sem prazo' },
  { value: '4', label: '4 semanas' },
  { value: '6', label: '6 semanas' },
  { value: '8', label: '8 semanas' },
  { value: '12', label: '12 semanas' },
];
export const MAX_EXERCISES = 20;

const ERRORS = {
  not_authorized: 'Você não tem vínculo ativo com este aluno.',
  invalid_name: 'Dê um nome ao plano (2 a 60 letras).',
  invalid_days: 'O plano precisa de 1 a 7 dias.',
  invalid_exercises: 'Cada dia precisa de 1 a 20 exercícios, todos com nome.',
  invalid_duration: 'Duração inválida.',
};

export function friendlyPlanError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : 'Não foi possível enviar o treino. Tente de novo.';
}

export function emptyExercise() {
  return { nome: '', series: '3', reps: '10-12', descanso: '60s', tecnica: '' };
}

export function emptyDay(dia) {
  return { dia, foco: '', exercicios: [emptyExercise()] };
}

export function emptyDraft() {
  return { name: '', weeks: '', days: [] };
}

// Ordem da semana, independente da ordem em que o personal marcou os dias.
export function sortDays(days) {
  return [...days].sort((a, b) => WEEK_DAYS.indexOf(a.dia) - WEEK_DAYS.indexOf(b.dia));
}

export function toggleDay(draft, dia) {
  const has = draft.days.some(d => d.dia === dia);
  const days = has ? draft.days.filter(d => d.dia !== dia) : sortDays([...draft.days, emptyDay(dia)]);
  return { ...draft, days };
}

export function moveItem(list, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// Rascunho a partir do plano ativo do aluno (retorno de trainer_client_plan).
export function draftFromPlan(plan) {
  if (!plan) return emptyDraft();
  return {
    name: plan.name || '',
    weeks: plan.duration_weeks ? String(plan.duration_weeks) : '',
    days: sortDays((plan.days || []).map(d => ({
      dia: d.dia,
      foco: d.foco || '',
      exercicios: (d.exercicios || []).map(e => ({
        nome: e.nome || '', series: e.series || '', reps: e.reps || '', descanso: e.descanso || '', tecnica: e.tecnica || '',
      })),
    }))),
  };
}

// Valida o rascunho e devolve o payload limpo (sem exercícios em branco).
export function buildPlanPayload(draft) {
  const name = String(draft.name || '').trim();
  if (name.length < 2) return { ok: false, error: 'Dê um nome ao plano.' };
  if (!draft.days.length) return { ok: false, error: 'Marque pelo menos um dia de treino.' };

  const days = [];
  for (const d of draft.days) {
    const exercicios = d.exercicios
      .map(e => ({
        nome: String(e.nome || '').trim(),
        series: String(e.series || '').trim(),
        reps: String(e.reps || '').trim(),
        descanso: String(e.descanso || '').trim(),
        tecnica: String(e.tecnica || '').trim(),
      }))
      .filter(e => e.nome);
    if (!exercicios.length) return { ok: false, error: `${d.dia}: adicione pelo menos um exercício.` };
    if (exercicios.length > MAX_EXERCISES) return { ok: false, error: `${d.dia}: no máximo ${MAX_EXERCISES} exercícios.` };
    days.push({ dia: d.dia, foco: String(d.foco || '').trim(), exercicios });
  }
  const weeks = draft.weeks === '' ? null : Number(draft.weeks);
  return { ok: true, name, days, weeks };
}

export async function fetchClientPlan(clientId) {
  const { data, error } = await db.rpc('trainer_client_plan', { p_client: clientId });
  if (error) throw error;
  return data;
}

export async function assignPlan(clientId, payload) {
  const { data, error } = await db.rpc('trainer_assign_plan', {
    p_client: clientId, p_name: payload.name, p_days: payload.days, p_duration_weeks: payload.weeks,
  });
  if (error) throw error;
  return data;
}
