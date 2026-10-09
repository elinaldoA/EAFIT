// Pesquisa "por que você parou?", enviada por e-mail a quem está há mais de 4
// semanas sem treinar (regra em weeklyEmails.ts). Cada motivo é um link do
// e-mail: um toque abre o app, que grava a resposta pela Edge Function
// inactivity-reason — sem login, autorizado pelo código assinado do link.
import { APP_URL } from './emailLayout.ts';
import { signedUserToken, verifyUserToken } from './emailPrefs.ts';
import type { Lang } from './lang.ts';

// Mesma lista do check da tabela inactivity_surveys e da tela do app
// (app-react/src/lib/inactivitySurvey.js).
export const INACTIVITY_REASONS = ['sem_tempo', 'treino', 'app_dificil', 'outro_app', 'saude', 'pausa', 'outro'] as const;
export type InactivityReason = typeof INACTIVITY_REASONS[number];

export const COMMENT_MAX = 500;

const LABELS: Record<InactivityReason, Record<Lang, string>> = {
  sem_tempo: { pt: 'Estou sem tempo', en: 'I have no time' },
  treino: { pt: 'Os treinos não combinam comigo', en: 'The workouts do not suit me' },
  app_dificil: { pt: 'Achei o app difícil de usar', en: 'I found the app hard to use' },
  outro_app: { pt: 'Uso outro app ou treino com um personal', en: 'I use another app or train with a coach' },
  saude: { pt: 'Lesão ou questão de saúde', en: 'Injury or health issue' },
  pausa: { pt: 'Só dei um tempo, volto em breve', en: 'Just taking a break, I will be back' },
  outro: { pt: 'Outro motivo', en: 'Another reason' },
};

export function isInactivityReason(value: unknown): value is InactivityReason {
  return (INACTIVITY_REASONS as readonly unknown[]).includes(value);
}

export function reasonLabel(lang: Lang, reason: InactivityReason): string {
  return LABELS[reason][lang];
}

const PURPOSE = 'inactivity-survey';

export function surveyToken(userId: string, secret: string): Promise<string> {
  return signedUserToken(PURPOSE, userId, secret);
}

export function verifySurveyToken(token: unknown, secret: string): Promise<string | null> {
  return verifyUserToken(PURPOSE, token, secret);
}

export function surveyLink(token: string, reason: InactivityReason): string {
  return `${APP_URL}?motivo=${reason}&r=${encodeURIComponent(token)}`;
}

// Comentário opcional: texto aparado, vazio vira null, longo demais é cortado.
export function cleanComment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, COMMENT_MAX) || null;
}
