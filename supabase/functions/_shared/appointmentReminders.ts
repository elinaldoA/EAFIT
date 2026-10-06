// Regras puras da Edge Function send-appointment-reminders (testáveis sem rede/banco).

import { ALERT_FIRST_HOUR, ALERT_LAST_HOUR } from './trainerAlerts.ts';

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
export function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildReminderPush(r: ReminderRow): { title: string; body: string } {
  const when = whenLabel(r.ar_starts);
  const place = r.ar_place ? ` · ${r.ar_place}` : '';
  const title = r.ar_kind === 'hour' ? 'Sua aula é daqui a pouco ⏰' : 'Aula amanhã 📅';
  const pending = r.ar_role === 'client' && r.ar_status === 'pending' ? ' Confirme no app.' : '';
  return { title, body: `Aula com ${r.ar_other}: ${when}${place}.${pending}` };
}

// Aviso ao personal quando o aluno responde a uma aula.
export function buildResponsePush(status: 'confirmed' | 'declined', clientName: string, startsIso: string): { title: string; body: string } {
  const when = whenLabel(startsIso);
  return status === 'confirmed'
    ? { title: 'Aula confirmada ✅', body: `${clientName} confirmou a aula de ${when}.` }
    : { title: 'Aula recusada', body: `${clientName} não poderá na aula de ${when}.` };
}
