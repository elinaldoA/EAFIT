import { db } from './supabase';
import { fetchAttention } from './attention';

// Radar do Dashboard: junta números que o painel já calcula (prévia do
// relatório semanal, regras de alerta e contadores do menu) e transforma em
// uma lista curta do que mudou e do que fazer, em ordem de prioridade.
// Nada aqui grava — cada fonte que falhar só tira os itens dela do radar.

const TONE_ORDER = { danger: 0, warning: 1, info: 2, good: 3 };

// Variação só conta com base mínima: sem isso, 2 → 4 cadastros vira "+100%".
const MIN_BASE = 10;
const TREND_PCT = 20;

const ALERT_LINKS = {
  erros_hora: { to: '/erros', cta: 'Ver erros' },
  cadastros_queda: { to: '/engajamento', cta: 'Ver engajamento' },
  jobs_falhando: { to: '/saude', cta: 'Ver saúde do sistema' },
  suporte_atrasado: { to: '/suporte', cta: 'Abrir suporte' },
};

function change(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p < MIN_BASE) return null;
  return Math.round(((c - p) / p) * 100);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// digest: jsonb de admin_digest_preview; alerts: linhas de admin_alert_status;
// attention: fetchAttention(). Qualquer um pode vir null.
export function buildRadar({ digest, alerts, attention } = {}) {
  const items = [];
  const add = (key, tone, text, to, cta, weight = 0) => items.push({ key, tone, text, to, cta, weight });
  const d = digest || {};
  const firing = new Set();

  for (const a of alerts || []) {
    if (!a.ac_enabled || !a.ac_over) continue;
    const link = ALERT_LINKS[a.ac_key];
    if (!link) continue;
    firing.add(a.ac_key);
    add(`alerta:${a.ac_key}`, 'danger', `Alerta: ${a.ac_detail}`, link.to, link.cta, 100);
  }

  const pain = Number(attention?.pain) || 0;
  if (pain > 0) add('dor', 'danger', `${plural(pain, 'relato', 'relatos')} de dor forte ou lesão nos últimos 7 dias`, '/seguranca', 'Ver segurança', 90 + pain);

  const late = Number(d.support_late) || 0;
  if (late > 0 && !firing.has('suporte_atrasado')) {
    add('suporte', 'warning', `${plural(late, 'item', 'itens')} de suporte esperando há mais de 48 h`, '/suporte', 'Abrir suporte', 60 + late);
  }

  const overdue = Number(attention?.overdue) || 0;
  if (overdue > 0) add('agendadas', 'warning', `${plural(overdue, 'notificação agendada passou', 'notificações agendadas passaram')} do horário sem sair`, '/saude', 'Ver saúde do sistema', 55);

  const newErrors = Array.isArray(d.new_errors) ? d.new_errors : [];
  if (newErrors.length && !firing.has('erros_hora')) {
    const top = newErrors[0];
    add('erros-novos', 'warning',
      `${plural(newErrors.length, 'tipo de erro apareceu', 'tipos de erro apareceram')} pela primeira vez esta semana — o mais comum (${top.n}×): “${top.message}”`,
      '/erros', 'Ver erros', 50 + newErrors.length);
  }

  const errDiff = change(d.errors, d.errors_prev);
  if (errDiff !== null && errDiff >= 100 && !newErrors.length && !firing.has('erros_hora')) {
    add('erros-alta', 'warning', `Erros do app subiram ${errDiff}% na semana (${d.errors} contra ${d.errors_prev})`, '/erros', 'Ver erros', 45);
  }

  const signups = change(d.signups, d.signups_prev);
  if (signups !== null && signups <= -TREND_PCT && !firing.has('cadastros_queda')) {
    add('cadastros', 'warning', `Cadastros caíram ${Math.abs(signups)}% na semana (${d.signups} contra ${d.signups_prev})`, '/engajamento', 'Ver engajamento', 40);
  } else if (signups !== null && signups >= TREND_PCT) {
    add('cadastros', 'good', `Cadastros subiram ${signups}% na semana (${d.signups} contra ${d.signups_prev})`, '/comportamento', 'Ver de onde vieram', 20);
  }

  const trained = change(d.trained, d.trained_prev);
  if (trained !== null && trained <= -TREND_PCT) {
    add('treinaram', 'warning', `${Math.abs(trained)}% menos pessoas treinaram esta semana (${d.trained} contra ${d.trained_prev})`, '/engajamento', 'Ver engajamento', 38);
  } else if (trained !== null && trained >= TREND_PCT) {
    add('treinaram', 'good', `${trained}% mais pessoas treinaram esta semana (${d.trained} contra ${d.trained_prev})`, '/engajamento', 'Ver engajamento', 18);
  }

  const npsAnswers = Number(d.nps_answers) || 0;
  if (d.nps !== null && d.nps !== undefined && npsAnswers >= 5) {
    const nps = Number(d.nps);
    if (nps < 0) add('nps', 'warning', `NPS da semana está em ${nps} (${npsAnswers} respostas) — mais detratores que promotores`, '/pesquisas', 'Ver respostas', 35);
    else if (nps >= 50) add('nps', 'good', `NPS da semana em ${nps} (${npsAnswers} respostas)`, '/pesquisas', 'Ver respostas', 15);
  }

  const feedback = Number(attention?.feedback) || 0;
  if (feedback > 0) add('feedback', 'info', `${plural(feedback, 'feedback novo', 'feedbacks novos')} de usuários para ler`, '/feedback', 'Ver feedback', 30 + feedback);

  const risk = Number(d.risk_high) || 0;
  if (risk > 0) add('risco', 'info', `${plural(risk, 'pessoa com risco alto', 'pessoas com risco alto')} de parar de treinar — vale um contato antes que sumam`, '/engajamento', 'Ver quem são', 25 + Math.min(risk, 20));

  const partner = Array.isArray(d.partners) ? d.partners[0] : null;
  if (partner && Number(partner.n) > 0) {
    add('parceiro', 'good', `${partner.name} trouxe ${plural(Number(partner.n), 'cadastro', 'cadastros')} esta semana`, '/embaixadores', 'Ver parceiros', 10);
  }

  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.weight - a.weight);
}

async function rpcOrNull(name) {
  try {
    const { data, error } = await db.rpc(name);
    return error ? null : data;
  } catch {
    return null;
  }
}

// `partial` avisa quando alguma fonte falhou, para a tela não dizer
// "tudo em dia" sem ter conseguido olhar tudo.
export async function fetchRadar() {
  const [digest, alerts, attention] = await Promise.all([
    rpcOrNull('admin_digest_preview'),
    rpcOrNull('admin_alert_status'),
    fetchAttention().catch(() => null),
  ]);
  return {
    items: buildRadar({ digest, alerts, attention }),
    partial: digest === null || alerts === null || attention === null,
  };
}
