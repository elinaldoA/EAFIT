import { t } from './i18n';

// Regras dos dados do cadastro, as mesmas no onboarding e no Perfil (e os
// mesmos min/max dos inputs). Sem elas o Perfil gravava qualquer coisa: peso
// apagado mandava a pessoa de volta ao onboarding (App.jsx olha só o `peso`),
// que semeava outro plano por cima do atual; altura em metros (1.78) ou peso
// 3 distorciam o IMC e o treino gerado.

export const BODY_LIMITS = { idade: [14, 100], peso: [30, 300], altura: [100, 250] };
export const NAME_MAX = 50;
export const WATER_LIMITS = [0.5, 10];

const filled = v => v !== undefined && v !== null && String(v).trim() !== '';
const num = v => Number(String(v ?? '').trim().replace(',', '.'));
const inRange = (v, [min, max]) => { const n = num(v); return Number.isFinite(n) && n >= min && n <= max; };

// Devolve { field, message } do primeiro problema, ou null. `onboarding`
// exige sexo e idade; no Perfil eles podem ficar vazios (contas antigas), mas
// se preenchidos precisam valer. Peso e altura são sempre obrigatórios.
export function validateBody({ sexo, idade, peso, altura, pesoAlvo }, { onboarding = false } = {}) {
  if (onboarding && (!sexo || !inRange(idade, BODY_LIMITS.idade))) {
    return { field: 'idade', message: t('Preencha sexo e uma idade válida (14–100).') };
  }
  if (sexo && !['M', 'F'].includes(sexo)) return { field: 'sexo', message: t('Selecione o sexo biológico.') };
  if (filled(idade) && !inRange(idade, BODY_LIMITS.idade)) return { field: 'idade', message: t('Informe uma idade válida (14–100).') };
  if (!inRange(peso, BODY_LIMITS.peso)) return { field: 'peso', message: t('Informe um peso válido (kg).') };
  if (!inRange(altura, BODY_LIMITS.altura)) return { field: 'altura', message: t('Informe uma altura válida (cm).') };
  if (filled(pesoAlvo) && !inRange(pesoAlvo, BODY_LIMITS.peso)) return { field: 'pesoAlvo', message: t('Informe um peso alvo válido (kg).') };
  return null;
}

// Nome, sobrenome e apelido sem espaços nas pontas e com tamanho limitado.
export function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

export function validWeeklyGoal(value) {
  return /^[1-7]$/.test(String(value ?? '').trim());
}

// Vazio vale (usa a meta calculada pelo peso).
export function validWaterGoal(value) {
  return !filled(value) || inRange(value, WATER_LIMITS);
}
