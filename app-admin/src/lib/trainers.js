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
