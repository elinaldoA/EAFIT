import { db } from './supabase';
import { sendMessage } from './trainerMessages';

import { t } from './i18n';
import { normalizeIntensity } from './intensity';
export const WEEK_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const DURATION_CHOICES = [
  { value: '', label: t('Sem prazo') },
  { value: '4', label: '4 semanas' },
  { value: '6', label: '6 semanas' },
  { value: '8', label: '8 semanas' },
  { value: '12', label: '12 semanas' },
];
export const MAX_EXERCISES = 20;

const ERRORS = {
  not_authorized: t('Você não tem vínculo ativo com este aluno.'),
  invalid_name: t('Dê um nome ao plano (2 a 60 letras).'),
  invalid_days: t('O plano precisa de 1 a 7 dias.'),
  invalid_exercises: t('Cada dia precisa de 1 a 20 exercícios, todos com nome.'),
  invalid_duration: t('Duração inválida.'),
  no_duration: t('Este plano não tem duração definida. Use "Editar / enviar novo treino".'),
  no_plan: t('O aluno não tem plano ativo para renovar.'),
};

export function friendlyPlanError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível enviar o treino. Tente de novo.');
}

export function emptyExercise() {
  return { nome: '', series: '3', reps: '10-12', descanso: '60s', tecnica: '', intensidade: '' };
}

export function emptyDay(dia) {
  return { dia, foco: '', exercicios: [emptyExercise()] };
}

export function emptyDraft() {
  return { name: '', weeks: '', step: null, deloadEvery: null, days: [] };
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
    step: plan.progressao_passo != null ? Number(plan.progressao_passo) : null,
    deloadEvery: plan.deload_a_cada ?? null,
    days: sortDays((plan.days || []).map(d => ({
      dia: d.dia,
      foco: d.foco || '',
      exercicios: (d.exercicios || []).map(e => ({
        nome: e.nome || '', series: e.series || '', reps: e.reps || '', descanso: e.descanso || '', tecnica: e.tecnica || '',
        grupo: e.grupo || '', aquecimento: e.aquecimento ?? '', intensidade: e.intensidade || '',
      })),
    }))),
  };
}

// Valida o rascunho e devolve o payload limpo (sem exercícios em branco).
export function buildPlanPayload(draft) {
  const name = String(draft.name || '').trim();
  if (name.length < 2) return { ok: false, error: t('Dê um nome ao plano.') };
  if (!draft.days.length) return { ok: false, error: t('Marque pelo menos um dia de treino.') };

  const days = [];
  for (const d of draft.days) {
    const exercicios = d.exercicios
      .map(e => ({
        nome: String(e.nome || '').trim(),
        series: String(e.series || '').trim(),
        reps: String(e.reps || '').trim(),
        descanso: String(e.descanso || '').trim(),
        tecnica: String(e.tecnica || '').trim(),
        grupo: /^[A-Z]$/.test(e.grupo || '') ? e.grupo : null,
        intensidade: normalizeIntensity(e.intensidade),
        aquecimento: e.aquecimento === '' || e.aquecimento == null ? null : Number(e.aquecimento),
      }))
      .filter(e => e.nome);
    if (!exercicios.length) return { ok: false, error: t('{dia}: adicione pelo menos um exercício.', { dia: d.dia }) };
    if (exercicios.length > MAX_EXERCISES) return { ok: false, error: t('{dia}: no máximo {MAX_EXERCISES} exercícios.', { dia: d.dia, MAX_EXERCISES }) };
    days.push({ dia: d.dia, foco: String(d.foco || '').trim(), exercicios });
  }
  const weeks = draft.weeks === '' ? null : Number(draft.weeks);
  return { ok: true, name, days, weeks, step: draft.step || null, deloadEvery: draft.deloadEvery || null };
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
  // Periodização é opcional e vai depois: se falhar, o plano já foi enviado.
  if (payload.step || payload.deloadEvery) {
    const { error: progErr } = await db.rpc('trainer_set_plan_progression', {
      p_client: clientId, p_step: payload.step || null, p_deload: payload.deloadEvery || null,
    });
    if (progErr) console.warn('trainer_set_plan_progression:', progErr);
  }
  return data;
}

// Renova o plano ativo do aluno: mesmo nome, dias e exercícios, mesma duração,
// recomeçando hoje. O plano anterior fica salvo no histórico (só inativo). O
// aviso ao aluno é melhor esforço: a renovação já valeu.
export async function renewPlan(clientId) {
  const plan = await fetchClientPlan(clientId);
  if (!plan) throw new Error('no_plan');
  if (!plan.duration_weeks) throw new Error('no_duration');
  const payload = buildPlanPayload(draftFromPlan(plan));
  if (!payload.ok) throw new Error(payload.error);
  await assignPlan(clientId, payload);
  sendMessage([clientId], t('Seu personal renovou seu plano "{name}" por mais {n} semanas. Bons treinos!', { name: payload.name, n: payload.weeks }), 'treino')
    .catch(err => console.warn('aviso de plano renovado:', err));
  return payload;
}

// Copia foco e exercícios de um dia para outro (cria o dia se não existir e
// substitui o conteúdo se já existir).
export function copyDay(draft, fromDia, toDia) {
  const src = draft.days.find(d => d.dia === fromDia);
  if (!src || fromDia === toDia) return draft;
  const copy = { dia: toDia, foco: src.foco, exercicios: src.exercicios.map(e => ({ ...e })) };
  const rest = draft.days.filter(d => d.dia !== toDia);
  return { ...draft, days: sortDays([...rest, copy]) };
}

export function duplicateItem(list, index) {
  if (index < 0 || index >= list.length) return list;
  return [...list.slice(0, index + 1), { ...list[index] }, ...list.slice(index + 1)];
}

// "3" -> 3, "3-4" -> 3, "4x" -> 4; o resto vira 0.
export function parseSeries(value) {
  const n = parseInt(String(value || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Séries de trabalho por grupo muscular na semana, a partir da biblioteca
// (`byName`: nome em minúsculas -> linha com grupo_muscular). Exercício fora
// da biblioteca entra em "Outros". Do maior volume para o menor.
export function volumeByGroup(draft, byName) {
  const totals = new Map();
  for (const day of draft.days) {
    for (const e of day.exercicios) {
      const nome = String(e.nome || '').trim();
      if (!nome) continue;
      const grupo = byName.get(nome.toLowerCase())?.grupo_muscular || t('Outros');
      totals.set(grupo, (totals.get(grupo) || 0) + parseSeries(e.series));
    }
  }
  return [...totals.entries()].map(([grupo, series]) => ({ grupo, series })).sort((a, b) => b.series - a.series);
}
