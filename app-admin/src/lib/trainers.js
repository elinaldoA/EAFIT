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

// Saúde da carteira (supabase/migrations/20261126010000_admin_trainer_health.sql).
// Os critérios de "parado" e "sem contato" valem igual no banco e em clientFlags.
export const IDLE_DAYS = 14;
export const NO_CONTACT_DAYS = 30;

// Por personal, indexado pelo id do usuário. Novos/encerrados seguem o período
// (0 = desde sempre); o resto é a situação de hoje.
export async function fetchTrainerHealth(days = 30) {
  const rows = await rpcRows('admin_trainer_health', { days_back: days });
  return Object.fromEntries(rows.filter(r => r.th_user).map(r => [r.th_user, {
    active: Number(r.th_active) || 0, added: Number(r.th_new) || 0, lost: Number(r.th_lost) || 0,
    withGoal: Number(r.th_with_goal) || 0, goalWeeks: Number(r.th_goal_weeks) || 0, goalHit: Number(r.th_goal_hit) || 0,
    idle: Number(r.th_idle14) || 0, noContact: Number(r.th_no_contact30) || 0,
  }]));
}

// Alunos ativos de um personal com treino, meta e último contato.
export async function fetchTrainerClientsDetail(trainerId) {
  const rows = await rpcRows('admin_trainer_clients_detail', { p_trainer: trainerId });
  return rows.map(r => ({
    userId: r.tcd_user, name: r.tcd_name, since: r.tcd_since, days30: Number(r.tcd_days30) || 0,
    lastDay: r.tcd_last_day, weeklyGoal: r.tcd_weekly_goal ?? null,
    goalWeeks: Number(r.tcd_goal_weeks) || 0, goalHit: Number(r.tcd_goal_hit) || 0, lastContact: r.tcd_last_contact,
  }));
}

// % das semanas avaliadas em que o aluno bateu a meta; sem semana, sem taxa.
export function goalRate(weeks, hit) {
  return weeks > 0 ? Math.round((hit / weeks) * 100) : null;
}

const DAY_MS = 86400000;

// Dias de calendário desde uma data 'AAAA-MM-DD' (no fuso do navegador).
function daysSinceDate(ymd, now) {
  const [y, m, d] = ymd.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - new Date(y, m - 1, d)) / DAY_MS);
}

// Alertas de um aluno: 'idle' (parado) e 'noContact' (sem contato do personal).
export function clientFlags(c, now = new Date()) {
  const linkedMs = now - new Date(c.since);
  const flags = [];
  if (linkedMs >= IDLE_DAYS * DAY_MS && (!c.lastDay || daysSinceDate(c.lastDay, now) >= IDLE_DAYS)) flags.push('idle');
  if (linkedMs >= NO_CONTACT_DAYS * DAY_MS && (!c.lastContact || now - new Date(c.lastContact) > NO_CONTACT_DAYS * DAY_MS)) {
    flags.push('noContact');
  }
  return flags;
}
