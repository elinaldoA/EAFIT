import { db } from './supabase';
import { lang } from './i18n';

// Pesquisas do painel (Acompanhamento → Pesquisas): NPS, escolha ou texto.
// O banco decide quem está no público (supabase/migrations/20261128070000_surveys.sql);
// aqui só fica o "Agora não", guardado no aparelho por pesquisa.
const SNOOZE_KEY = 'eafit_survey_snooze';
export const SNOOZE_DAYS = 3;
export const COMMENT_MAX = 500;

function readSnoozes() {
  try {
    const saved = JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

export function isSnoozed(surveyId, now = Date.now()) {
  const at = Number(readSnoozes()[surveyId]) || 0;
  return !!at && now - at < SNOOZE_DAYS * 86400000;
}

export function snoozeSurvey(surveyId, now = Date.now()) {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ ...readSnoozes(), [surveyId]: now })); } catch { /* sem armazenamento */ }
}

// Pergunta no idioma do app (sem versão em inglês, fica a original).
export function surveyQuestion(survey) {
  return lang === 'en' && survey?.question_en ? survey.question_en : survey?.question || '';
}

// A pesquisa pendente para esta pessoa, ou null (falha de rede = sem pesquisa).
export async function fetchPendingSurvey(now = Date.now()) {
  try {
    const { data, error } = await db.rpc('my_pending_survey');
    if (error) return null;
    const survey = (data || [])[0] || null;
    return survey && !isSnoozed(survey.id, now) ? survey : null;
  } catch {
    return null;
  }
}

export async function answerSurvey(survey, { score = null, choice = null, comment = '' }) {
  const { error } = await db.rpc('answer_survey', {
    p_survey: survey.id,
    p_score: survey.kind === 'nps' ? score : null,
    p_choice: survey.kind === 'escolha' ? choice : null,
    p_comment: String(comment || '').trim().slice(0, COMMENT_MAX) || null,
  });
  if (error) throw error;
}
