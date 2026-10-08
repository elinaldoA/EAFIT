// Regras do e-mail semanal (send-weekly-emails): quem recebe e qual dos dois.
// Separado da função pra ser testável sem rede/banco.
//
//  * resumo: treinou pelo menos uma vez na semana passada;
//  * volta: não treinou na semana e está parado há 1 a 4 semanas (contando do
//    último treino ou, pra quem nunca treinou, da criação da conta). Depois
//    disso para de insistir.
import { emailOptedIn } from './emailPrefs.ts';

export const COMEBACK_MIN_DAYS = 7;
export const COMEBACK_MAX_DAYS = 28;

// O Gmail limita a ~500 destinatários por dia, somando os e-mails do login;
// o teto deixa folga pra eles.
export const MAX_BULK_EMAILS = 300;

export type EmailUser = {
  id: string;
  email: string | null;
  confirmed: boolean;
  bannedUntil: string | null;
  createdAt: string;
  meta: Record<string, unknown>;
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// Pode receber e-mail que não é de conta/segurança (resumo, volta,
// comunicado): tem endereço confirmado, não está suspenso e não se descadastrou.
export function canReceiveBulkEmail(user: EmailUser, now: Date = new Date()): boolean {
  if (!user.email || !user.confirmed) return false;
  if (user.bannedUntil && new Date(user.bannedUntil).getTime() > now.getTime()) return false;
  return emailOptedIn(user.meta);
}

// Modo pausa do app (user_metadata.pausedUntil, 'YYYY-MM-DD' inclusive): quem
// pausou não quer ser cobrado, nem por e-mail.
export function isPaused(meta: Record<string, unknown>, today: string): boolean {
  return typeof meta.pausedUntil === 'string' && meta.pausedUntil >= today;
}

export type WeeklyEmail = { kind: 'summary' } | { kind: 'comeback'; days: number; neverTrained: boolean } | null;

export function weeklyEmailFor(input: {
  weekCount: number;
  lastWorkoutDate: string | null;
  createdDate: string;
  today: string;
}): WeeklyEmail {
  if (input.weekCount > 0) return { kind: 'summary' };
  const days = daysBetween(input.lastWorkoutDate ?? input.createdDate, input.today);
  if (days < COMEBACK_MIN_DAYS || days > COMEBACK_MAX_DAYS) return null;
  return { kind: 'comeback', days, neverTrained: !input.lastWorkoutDate };
}
