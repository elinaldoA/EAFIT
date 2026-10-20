import { db } from './supabase';
import { bulkNotify } from './bulkActions';

// Previsão de abandono (Análises → Engajamento): nota de 0 a 100 para quem
// ainda treina, calculada em
// supabase/migrations/20261128020000_admin_churn_risk.sql.

export const REASON_LABELS = {
  intervalo: 'Passou do intervalo habitual',
  queda: 'Treinando menos',
  bem_estar: 'Bem-estar baixo',
  desconforto: 'Desconforto ou lesão',
  plano: 'Plano vencido ou sem plano',
  sem_abrir: 'Não abre o app há 7 dias',
};

// Faixas da nota; "contatar hoje" = alto e sem aviso recebido nos últimos 3 dias.
export const HIGH_SCORE = 50;
export const MEDIUM_SCORE = 25;
export const CONTACT_COOLDOWN_DAYS = 3;

export function riskLevel(score) {
  if (score >= HIGH_SCORE) return 'high';
  if (score >= MEDIUM_SCORE) return 'medium';
  return 'low';
}

export const LEVEL_LABELS = { high: 'Alto', medium: 'Médio', low: 'Baixo' };

export function mapRisk(r) {
  return {
    id: r.cr_user,
    email: r.cr_email,
    name: r.cr_name,
    score: Number(r.cr_score) || 0,
    reasons: r.cr_reasons || [],
    lastDay: r.cr_last_day,
    daysSince: r.cr_days_since,
    typicalGap: r.cr_typical_gap == null ? null : Number(r.cr_typical_gap),
    recent14: Number(r.cr_recent14) || 0,
    prev14: r.cr_prev14 == null ? null : Number(r.cr_prev14),
    wellbeing: r.cr_wellbeing == null ? null : Number(r.cr_wellbeing),
    planEnd: r.cr_plan_end,
    lastOpen: r.cr_last_open,
    lastContact: r.cr_last_contact,
  };
}

export function contactedRecently(row, now = Date.now()) {
  return !!row.lastContact && now - new Date(row.lastContact).getTime() < CONTACT_COOLDOWN_DAYS * 86400000;
}

export function contactQueue(rows, now = Date.now()) {
  return rows.filter(r => r.score >= HIGH_SCORE && !contactedRecently(r, now));
}

const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';

// Mensagem sugerida conforme o principal motivo (o admin pode editar antes de enviar).
export function suggestedMessage(row) {
  const nome = row.name && !row.name.includes('@') ? firstName(row.name) : '';
  const hi = nome ? `${nome}, ` : '';
  const main = row.reasons[0];
  if (main === 'desconforto' || row.reasons.includes('desconforto')) {
    return { title: '💬 Como você está?', body: `${hi}vimos que um exercício incomodou. Que tal ajustar o treino para voltar sem dor?` };
  }
  if (row.reasons.includes('plano') && !row.reasons.includes('intervalo')) {
    return { title: '📅 Hora do próximo ciclo', body: `${hi}seu plano precisa de renovação. Monte o próximo em poucos toques.` };
  }
  if (main === 'bem_estar') {
    return { title: '🌱 Um treino leve hoje?', body: `${hi}dias puxados acontecem. Um treino curto já ajuda a recuperar a energia.` };
  }
  return { title: '💪 Sentimos sua falta', body: `${hi}seu treino está te esperando. Bora retomar o ritmo hoje?` };
}

export async function fetchChurnRisk(maxRows = 300) {
  const { data, error } = await db.rpc('admin_churn_risk', { max_rows: maxRows });
  if (error) throw error;
  return (data || []).map(mapRisk);
}

export function sendRiskNudge(userId, message) {
  return bulkNotify([userId], message);
}
