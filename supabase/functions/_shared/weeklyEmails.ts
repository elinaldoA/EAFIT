// Regras do e-mail semanal (send-weekly-emails): quem recebe e qual dos dois.
// Separado da função pra ser testável sem rede/banco.
//
//  * resumo: treinou pelo menos uma vez na semana passada;
//  * volta: não treinou na semana e está parado há 1 a 4 semanas (contando do
//    último treino ou, pra quem nunca treinou, da criação da conta). Depois
//    disso para de insistir;
//  * por quê: passou das 4 semanas. Em vez de mais um convite, pergunta o
//    motivo (_shared/inactivity.ts), uma vez só por período parado. O texto
//    muda conforme a pessoa sumiu do app ('absent', sem acesso há 30 dias ou
//    mais) ou continua entrando sem treinar ('idle').
import { emailOptedIn } from './emailPrefs.ts';

export const COMEBACK_MIN_DAYS = 7;
export const COMEBACK_MAX_DAYS = 28;
export const ABSENT_MIN_DAYS = 30;

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

export type InactivitySegment = 'absent' | 'idle';

export type WhyEmail = { kind: 'why'; days: number; neverTrained: boolean; segment: InactivitySegment };

export type WeeklyEmail = { kind: 'summary' } | { kind: 'comeback'; days: number; neverTrained: boolean } | WhyEmail | null;

// Último acesso conhecido e data da última pesquisa enviada (função
// email_inactivity_state do banco).
export type ActivityState = { lastSeenDate: string | null; lastAskedDate: string | null };

export function weeklyEmailFor(input: {
  weekCount: number;
  lastWorkoutDate: string | null;
  createdDate: string;
  today: string;
  // Sem estes dados a pesquisa de inatividade não sai (só resumo e volta).
  activity?: ActivityState | null;
}): WeeklyEmail {
  if (input.weekCount > 0) return { kind: 'summary' };
  const since = input.lastWorkoutDate ?? input.createdDate;
  const days = daysBetween(since, input.today);
  if (days < COMEBACK_MIN_DAYS) return null;
  const neverTrained = !input.lastWorkoutDate;
  if (days <= COMEBACK_MAX_DAYS) return { kind: 'comeback', days, neverTrained };

  if (!input.activity) return null;
  const { lastSeenDate, lastAskedDate } = input.activity;
  // Já perguntou neste período parado: não pergunta de novo.
  if (lastAskedDate && lastAskedDate >= since) return null;
  const seen = lastSeenDate && lastSeenDate > since ? lastSeenDate : since;
  const segment = daysBetween(seen, input.today) >= ABSENT_MIN_DAYS ? 'absent' : 'idle';
  return { kind: 'why', days, neverTrained, segment };
}
