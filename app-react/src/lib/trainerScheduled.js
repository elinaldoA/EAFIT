import { db } from './supabase';
import { MAX_MESSAGE } from './trainerMessages';

import { t, locale } from './i18n';
export const MAX_PENDING = 20;
export const MIN_LEAD_MINUTES = 5;
export const MAX_DAYS_AHEAD = 60;

const ERRORS = {
  not_authorized: t('Você não tem acesso a este recurso.'),
  invalid_body: t('Escreva a mensagem (até {MAX_MESSAGE} caracteres).', { MAX_MESSAGE }),
  invalid_when: t('Escolha um horário entre {n} minutos e {d} dias a partir de agora.', { n: MIN_LEAD_MINUTES, d: MAX_DAYS_AHEAD }),
  no_recipients: t('Nenhum aluno ativo para receber este recado.'),
  too_many: t('Você já tem {MAX_PENDING} recados agendados. Cancele algum para agendar outro.', { MAX_PENDING }),
  not_found: t('Este recado já foi enviado ou cancelado.'),
};

export function friendlyScheduleError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível concluir. Tente de novo.');
}

const pad = n => String(n).padStart(2, '0');

// Valor de <input type="datetime-local"> (hora local do aparelho, sem fuso).
export function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function minScheduleValue(now = new Date()) {
  return toLocalInput(new Date(now.getTime() + MIN_LEAD_MINUTES * 60000));
}

export function maxScheduleValue(now = new Date()) {
  return toLocalInput(new Date(now.getTime() + MAX_DAYS_AHEAD * 86400000));
}

// Valor do campo -> ISO (UTC) para o banco, ou null se vazio, inválido ou fora
// da janela permitida (de 5 minutos a 60 dias a partir de agora).
export function scheduleToIso(value, now = new Date()) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60000) return null;
  if (d.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86400000) return null;
  return d.toISOString();
}

// "ter., 20/10, 18:30" no fuso do aparelho.
export function whenLabel(iso) {
  return new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Quem recebe: "Todos os alunos", "Ana", "Ana, Bruno" ou "Ana, Bruno e mais 3".
export function scheduledTarget(item) {
  if (item.all) return t('Todos os alunos');
  const names = item.names || t('{n} aluno(s)', { n: item.count });
  const extra = item.count - String(item.names || '').split(', ').filter(Boolean).length;
  return extra > 0 ? t('{v1} e mais {n}', { v1: names, n: extra }) : names;
}

export async function scheduleMessage(clientIds, body, sendAtIso) {
  const { data, error } = await db.rpc('trainer_schedule_message', {
    p_clients: clientIds && clientIds.length ? clientIds : null,
    p_body: body,
    p_send_at: sendAtIso,
  });
  if (error) throw error;
  return data;
}

export async function fetchScheduled() {
  const { data, error } = await db.rpc('trainer_scheduled_messages');
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.sm_id, body: r.sm_body, at: r.sm_at, all: !!r.sm_all, count: r.sm_count || 0, names: r.sm_names || '',
  }));
}

export async function cancelScheduled(id) {
  const { error } = await db.rpc('trainer_cancel_scheduled', { p_id: id });
  if (error) throw error;
}
