import { db } from './supabase';

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export const APPOINTMENT_STATUS = {
  pending: { label: 'aguardando aluno', badge: 'badge--warning' },
  confirmed: { label: 'confirmada', badge: 'badge--ok' },
  declined: { label: 'recusada', badge: 'badge--danger' },
  cancelled: { label: 'cancelada', badge: '' },
};

// % das aulas já passadas que o aluno confirmou. As canceladas pelo personal
// saem da conta; sem aula válida no período, não há taxa.
export function confirmRate(a) {
  if (!a) return null;
  const valid = a.appts - a.cancelled;
  return valid > 0 ? Math.round((a.confirmed / valid) * 100) : null;
}

// Atividade por personal, indexada pelo id do usuário.
export async function fetchTrainerActivity(days = 30) {
  const rows = await rpcRows('admin_trainer_activity', { days_back: days });
  return Object.fromEntries(rows.filter(r => r.ta_user).map(r => [r.ta_user, {
    appts: Number(r.ta_appts), confirmed: Number(r.ta_confirmed), declined: Number(r.ta_declined),
    cancelled: Number(r.ta_cancelled), pending: Number(r.ta_pending), upcoming: Number(r.ta_upcoming),
    messages: Number(r.ta_messages), read: Number(r.ta_read), lastMessage: r.ta_last_message,
  }]));
}

export async function fetchUpcomingAppointments(maxRows = 30) {
  const rows = await rpcRows('admin_upcoming_appointments', { max_rows: maxRows });
  return rows.filter(r => r.ua_id).map(r => ({
    id: r.ua_id, trainerId: r.ua_trainer, trainerName: r.ua_trainer_name,
    clientId: r.ua_client, clientName: r.ua_client_name,
    starts: r.ua_starts, duration: r.ua_duration, status: r.ua_status,
  }));
}

// Link de divulgação do personal (https://eafit.com.br/app/?personal=CODIGO):
// quem cada um trouxe, como em Embaixadores e influenciadores.
// supabase/migrations/20261124010000_admin_trainer_invites.sql.
export const TRAINER_LINK_BASE = 'https://eafit.com.br/app/?personal=';

// Números do link por personal, indexados pelo id do usuário.
export async function fetchTrainerInvites(days = 30) {
  const rows = await rpcRows('admin_trainer_invites', { days_back: days });
  return Object.fromEntries(rows.filter(r => r.ti_user).map(r => [r.ti_user, {
    visits: Number(r.ti_visits) || 0, signups: Number(r.ti_signups) || 0, total: Number(r.ti_total) || 0,
    linked: Number(r.ti_linked) || 0, active7: Number(r.ti_active_7d) || 0, lastSignup: r.ti_last_signup,
  }]));
}

// Contas criadas pelo link de um personal; `client` = virou aluno dele.
export async function fetchTrainerInviteSignups(trainerId) {
  const rows = await rpcRows('admin_trainer_invite_signups', { p_trainer: trainerId });
  return rows.map(r => ({
    userId: r.ts_user, email: r.ts_email, name: r.ts_name, createdAt: r.ts_created,
    confirmed: !!r.ts_confirmed, lastSeen: r.ts_last_seen, workouts: Number(r.ts_workouts) || 0, client: !!r.ts_client,
  }));
}

// Ficha do usuário: por qual personal a conta chegou (null = nenhum).
export async function fetchUserTrainerInvite(userId) {
  const r = (await rpcRows('admin_user_trainer_invite', { p_user: userId }))[0];
  return r ? { trainerId: r.ti_trainer, name: r.ti_name, code: r.ti_code, createdAt: r.ti_created, client: !!r.ti_client } : null;
}

export function inviteConversion(visits, signups) {
  return visits > 0 ? Math.round((signups / visits) * 100) : null;
}
