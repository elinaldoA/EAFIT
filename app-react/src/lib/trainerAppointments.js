import { db } from './supabase';

export const DURATIONS = [30, 45, 60, 90, 120];

export const STATUS_LABEL = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmada',
  declined: 'Recusada pelo aluno',
  cancelled: 'Cancelada',
};

const ERRORS = {
  not_authorized: 'Você não tem vínculo ativo com este aluno.',
  invalid_time: 'Escolha uma data e hora no futuro.',
  invalid_duration: 'Duração inválida.',
  invalid_text: 'Local (até 120) ou observação (até 300 caracteres) grande demais.',
  too_many: 'Muitas aulas futuras com este aluno. Cancele alguma antes.',
  not_found: 'Esta aula não pode mais ser alterada.',
};

export function friendlyAppointmentError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : 'Não foi possível concluir. Tente de novo.';
}

// Valor de <input type="datetime-local"> (hora local) -> ISO, ou null se inválido.
export function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// "seg., 14/10, 18:00"
export function formatWhen(iso) {
  return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Aulas que ainda vão acontecer (ou estão acontecendo) e seguem de pé.
export function upcomingAppointments(rows, now = Date.now()) {
  return rows.filter(a => ['pending', 'confirmed'].includes(a.status)
    && new Date(a.starts).getTime() + (a.duration || 60) * 60_000 >= now);
}

const mapRow = r => ({
  id: r.ap_id, clientId: r.ap_client, name: r.ap_name, trainer: r.ap_trainer, starts: r.ap_starts,
  duration: r.ap_duration, place: r.ap_place, note: r.ap_note, status: r.ap_status,
});

// ---- personal --------------------------------------------------------------
export async function fetchTrainerAppointments(clientId = null) {
  const { data, error } = await db.rpc('trainer_appointments', { p_client: clientId });
  if (error) throw error;
  return (data || []).map(mapRow);
}

// Cria a aula e avisa o aluno por push (melhor esforço: a aula já está salva).
export async function createAppointment(clientId, { startsIso, duration, place, note }) {
  const { error } = await db.rpc('trainer_create_appointment', {
    p_client: clientId, p_starts: startsIso, p_duration: duration, p_place: place || null, p_note: note || null,
  });
  if (error) throw error;
  await pushToClient(clientId, 'Aula marcada', `${formatWhen(startsIso)}${place ? ` · ${place}` : ''}. Confirme no app.`);
}

export async function cancelAppointment(appointment) {
  const { error } = await db.rpc('trainer_cancel_appointment', { p_id: appointment.id });
  if (error) throw error;
  await pushToClient(appointment.clientId, 'Aula cancelada', `A aula de ${formatWhen(appointment.starts)} foi cancelada.`);
}

async function pushToClient(clientId, title, body) {
  try {
    await db.functions.invoke('trainer-push', { body: { client_ids: [clientId], title, body } });
  } catch (err) {
    console.warn('trainer-push:', err);
  }
}

// ---- aluno -----------------------------------------------------------------
export async function fetchMyAppointments() {
  const { data, error } = await db.rpc('my_appointments');
  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function respondAppointment(id, status) {
  const { error } = await db.rpc('respond_appointment', { p_id: id, p_status: status });
  if (error) throw error;
  // Avisa o personal (melhor esforço: a resposta já está salva).
  try {
    await db.functions.invoke('reply-push', { body: { appointment_id: id } });
  } catch (err) {
    console.warn('reply-push:', err);
  }
}
