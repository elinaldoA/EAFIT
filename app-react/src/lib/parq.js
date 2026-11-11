import { t } from './i18n';

// PAR-Q (questionário de prontidão para atividade física, 7 perguntas) e a
// anamnese curta do aluno. Tudo opcional e sem bloqueio: o app orienta, quem
// decide é o aluno com o profissional de saúde.
// Guardado em user_metadata: parqAt, parqVersion, parqAnswers ('0100000'),
// parqAlert, healthConsentAt, parqSkippedAt, lesoes, restricoes, medicamentos.
export const PARQ_VERSION = 1;
export const PARQ_VALID_DAYS = 365; // depois disso o app pede para reconfirmar
export const PARQ_SKIP_DAYS = 30; // quem pulou é lembrado de novo depois disso
export const HEALTH_TEXT_MAX = 200;
const DAY_MS = 86400000;

export function parqQuestions() {
  return [
    t('Algum médico já disse que você tem um problema de coração e que só deveria fazer atividade física supervisionada por profissionais de saúde?'),
    t('Você sente dores no peito quando pratica atividade física?'),
    t('No último mês, você sentiu dores no peito quando praticou atividade física?'),
    t('Você perde o equilíbrio por tontura ou já perdeu a consciência?'),
    t('Você tem algum problema ósseo ou articular que poderia piorar com a atividade física?'),
    t('Você toma atualmente algum medicamento para pressão arterial ou problema de coração?'),
    t('Você sabe de alguma outra razão pela qual não deva praticar atividade física?'),
  ];
}

export const PARQ_COUNT = 7;

// [true, false, ...] <-> '1000000'. Resposta ausente vira null.
export function encodeAnswers(answers) {
  return answers.map(a => (a ? '1' : '0')).join('');
}

export function decodeAnswers(str) {
  const s = String(str || '');
  if (!/^[01]{7}$/.test(s)) return Array(PARQ_COUNT).fill(null);
  return [...s].map(c => c === '1');
}

export function allAnswered(answers) {
  return answers.length === PARQ_COUNT && answers.every(a => a === true || a === false);
}

export function hasAlert(answers) {
  return answers.some(a => a === true);
}

function cleanText(v) {
  return String(v ?? '').trim().slice(0, HEALTH_TEXT_MAX);
}

// Campos a gravar no perfil ao salvar o formulário. Texto vazio apaga a chave.
export function healthFields({ answers, lesoes, restricoes, medicamentos }, now = new Date()) {
  return {
    parqAt: now.toISOString(),
    parqVersion: PARQ_VERSION,
    parqAnswers: encodeAnswers(answers),
    parqAlert: hasAlert(answers),
    healthConsentAt: now.toISOString(),
    parqSkippedAt: null,
    lesoes: cleanText(lesoes) || null,
    restricoes: cleanText(restricoes) || null,
    medicamentos: cleanText(medicamentos) || null,
  };
}

export function skipFields(now = new Date()) {
  return { parqSkippedAt: now.toISOString() };
}

function daysSince(iso, now) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? (now.getTime() - ms) / DAY_MS : Infinity;
}

// A tela aparece uma vez para quem nunca respondeu (conta nova ou antiga), de
// novo 30 dias depois de pular e quando a resposta passa de 12 meses ou muda a
// versão das perguntas. Antes do onboarding (sem peso) nunca aparece.
export function needsHealthScreen(meta, now = new Date()) {
  if (!meta || !meta.peso) return false;
  if (meta.parqAt) {
    return Number(meta.parqVersion || 0) < PARQ_VERSION || daysSince(meta.parqAt, now) > PARQ_VALID_DAYS;
  }
  if (meta.parqSkippedAt) return daysSince(meta.parqSkippedAt, now) > PARQ_SKIP_DAYS;
  return true;
}

// Perguntas respondidas "sim", para o personal ver quais foram.
export function yesQuestions(parqAnswers) {
  const questions = parqQuestions();
  return decodeAnswers(parqAnswers).map((a, i) => (a ? questions[i] : null)).filter(Boolean);
}
