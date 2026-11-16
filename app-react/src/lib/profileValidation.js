import { t } from './i18n';

// Regras dos dados do cadastro, as mesmas no onboarding e no Perfil (e os
// mesmos min/max dos inputs). Sem elas o Perfil gravava qualquer coisa: peso
// apagado mandava a pessoa de volta ao onboarding (App.jsx olha só o `peso`),
// que semeava outro plano por cima do atual; altura em metros (1.78) ou peso
// 3 distorciam o IMC e o treino gerado.

export const BODY_LIMITS = { idade: [14, 100], peso: [30, 300], altura: [100, 250] };
export const NAME_MAX = 50;

// Ids dos campos do "Meu corpo" no Perfil (ProfileBodySection), na ordem da tela:
// o Perfil leva o foco ao primeiro com erro.
export const BODY_FIELD_IDS = { sexo: 'profileSexo', idade: 'profileIdade', peso: 'profilePeso', altura: 'profileAltura', pesoAlvo: 'profilePesoAlvo' };
export const WATER_LIMITS = [0.5, 10];

const filled = v => v !== undefined && v !== null && String(v).trim() !== '';
const num = v => Number(String(v ?? '').trim().replace(',', '.'));
const inRange = (v, [min, max]) => { const n = num(v); return Number.isFinite(n) && n >= min && n <= max; };

// Altura digitada em metros (1,78 ou 1.78) vira centímetros (178). Só converte o que não pode ser
// centímetro (de 1 a 2,5); o resto volta como veio, para a validação acusar o erro de verdade.
export function heightToCm(value) {
  const n = num(value);
  if (!filled(value) || !Number.isFinite(n) || n < 1 || n > 2.5) return value;
  return String(Math.round(n * 100));
}

// Todos os problemas de uma vez, por campo ({ sexo: 'mensagem', … }; vazio = tudo
// certo). `onboarding` exige sexo e idade; no Perfil eles podem ficar vazios
// (contas antigas), mas se preenchidos precisam valer. Peso e altura são sempre
// obrigatórios; o peso alvo é opcional. O cadastro e o Perfil mostram cada erro
// junto do seu campo: com um erro por vez, a pessoa corrigia a idade, salvava
// e só então descobria que o peso também estava errado.
export function bodyErrors({ sexo, idade, peso, altura, pesoAlvo }, { onboarding = false } = {}) {
  const errors = {};
  if (onboarding ? !['M', 'F'].includes(sexo) : sexo && !['M', 'F'].includes(sexo)) errors.sexo = t('Selecione o sexo biológico.');
  if ((onboarding || filled(idade)) && !inRange(idade, BODY_LIMITS.idade)) errors.idade = t('Informe uma idade válida (14–100).');
  if (!inRange(peso, BODY_LIMITS.peso)) errors.peso = t('Informe um peso entre 30 e 300 kg.');
  if (!inRange(altura, BODY_LIMITS.altura)) errors.altura = t('Informe a altura entre 100 e 250 cm.');
  if (filled(pesoAlvo) && !inRange(pesoAlvo, BODY_LIMITS.peso)) errors.pesoAlvo = t('Informe um peso alvo entre 30 e 300 kg.');
  return errors;
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
