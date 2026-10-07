// Regras puras da Edge Function send-appointment-reminders (testáveis sem rede/banco).

import { ALERT_FIRST_HOUR, ALERT_LAST_HOUR } from './trainerAlerts.ts';
import { type Lang, localeOf } from './lang.ts';

export type ReminderRow = {
  ar_appt: string;
  ar_kind: 'day' | 'hour';
  ar_user: string;
  ar_role: 'client' | 'trainer';
  ar_other: string;
  ar_starts: string;
  ar_place: string | null;
  ar_status: string;
};

// Lembrete "de véspera" só em horário comercial de Brasília (não acorda
// ninguém); o "daqui a pouco" sai a qualquer hora, porque a aula é logo.
export function canSendNow(kind: 'day' | 'hour', hour: number): boolean {
  return kind === 'hour' || (hour >= ALERT_FIRST_HOUR && hour <= ALERT_LAST_HOUR);
}

// "seg., 20/10, 18:30" no fuso de Brasília.
export function whenLabel(iso: string, lang: Lang = 'pt'): string {
  return new Date(iso).toLocaleString(localeOf(lang), {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildReminderPush(r: ReminderRow, lang: Lang = 'pt'): { title: string; body: string } {
  const when = whenLabel(r.ar_starts, lang);
  const place = r.ar_place ? ` · ${r.ar_place}` : '';
  const pendingNow = r.ar_role === 'client' && r.ar_status === 'pending';
  if (lang === 'en') {
    const title = r.ar_kind === 'hour' ? 'Your session starts soon ⏰' : 'Session tomorrow 📅';
    return { title, body: `Session with ${r.ar_other}: ${when}${place}.${pendingNow ? ' Confirm in the app.' : ''}` };
  }
  const title = r.ar_kind === 'hour' ? 'Sua aula é daqui a pouco ⏰' : 'Aula amanhã 📅';
  const pending = pendingNow ? ' Confirme no app.' : '';
  return { title, body: `Aula com ${r.ar_other}: ${when}${place}.${pending}` };
}

// Aviso ao personal quando o aluno responde a uma aula.
export function buildResponsePush(status: 'confirmed' | 'declined', clientName: string, startsIso: string, lang: Lang = 'pt'): { title: string; body: string } {
  const when = whenLabel(startsIso, lang);
  if (lang === 'en') {
    return status === 'confirmed'
      ? { title: 'Session confirmed ✅', body: `${clientName} confirmed the session on ${when}.` }
      : { title: 'Session declined', body: `${clientName} can’t make the session on ${when}.` };
  }
  return status === 'confirmed'
    ? { title: 'Aula confirmada ✅', body: `${clientName} confirmou a aula de ${when}.` }
    : { title: 'Aula recusada', body: `${clientName} não poderá na aula de ${when}.` };
}
