import { db } from './supabase';

// Pesquisa de inatividade ("por que você parou?") enviada pelo e-mail semanal
// a quem passou de 4 semanas sem treinar. Motivos e segmentos são os mesmos
// de supabase/functions/_shared/inactivity.ts.
export const REASON_LABELS = {
  sem_tempo: 'Sem tempo',
  treino: 'Os treinos não combinam',
  app_dificil: 'App difícil de usar',
  outro_app: 'Usa outro app ou personal',
  saude: 'Lesão ou saúde',
  pausa: 'Só deu um tempo',
  outro: 'Outro motivo',
};

export const SEGMENT_LABELS = {
  absent: 'Sumiu do app',
  idle: 'Entra, mas não treina',
};

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

// Linhas de admin_inactivity_summary (is_reason = '' é quem não respondeu)
// viram: enviados, respondidos e taxa de resposta, no total e por segmento, e
// os motivos do mais citado pro menos citado.
export function summarizeSurveys(rows) {
  const segments = Object.fromEntries(Object.keys(SEGMENT_LABELS).map(k => [k, { sent: 0, answered: 0 }]));
  const byReason = {};
  for (const r of rows || []) {
    const total = Number(r.is_total) || 0;
    const seg = segments[r.is_segment] || (segments[r.is_segment] = { sent: 0, answered: 0 });
    seg.sent += total;
    if (!r.is_reason) continue;
    seg.answered += total;
    const reason = byReason[r.is_reason] || (byReason[r.is_reason] = { reason: r.is_reason, total: 0, absent: 0, idle: 0 });
    reason.total += total;
    reason[r.is_segment] = (reason[r.is_segment] || 0) + total;
  }
  const sent = Object.values(segments).reduce((a, s) => a + s.sent, 0);
  const answered = Object.values(segments).reduce((a, s) => a + s.answered, 0);
  return {
    sent,
    answered,
    rate: sent ? Math.round((answered / sent) * 100) : null,
    segments,
    reasons: Object.values(byReason)
      .map(r => ({ ...r, label: REASON_LABELS[r.reason] || r.reason, share: answered ? Math.round((r.total / answered) * 100) : 0 }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
  };
}

export async function fetchInactivitySummary() {
  return summarizeSurveys(await rpcRows('admin_inactivity_summary'));
}

export async function fetchInactivityAnswers(maxRows = 100) {
  return (await rpcRows('admin_inactivity_answers', { max_rows: maxRows })).map(r => ({
    id: r.ia_id, userId: r.ia_user, email: r.ia_email, name: r.ia_name, segment: r.ia_segment, reason: r.ia_reason,
    comment: r.ia_comment, days: r.ia_days, neverTrained: !!r.ia_never_trained, answeredAt: r.ia_answered,
  }));
}
