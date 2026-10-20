// Lógica pura de send-admin-digest (relatório semanal e alertas da equipe),
// testável sem rede/banco. Os números vêm de ops_digest_metrics e
// ops_alert_check (supabase/migrations/20261128100000_admin_digest_alerts.sql).
import type { EmailContent } from './emailLayout.ts';

export const ADMIN_URL = 'https://eafit.com.br/admin/';

export type DigestMetrics = {
  signups: number; signups_prev: number;
  trained: number; trained_prev: number;
  workouts: number; workouts_prev: number;
  errors: number; errors_prev: number;
  new_errors: { message: string; n: number }[];
  support_open: number; support_late: number;
  nps: number | null; nps_answers: number;
  risk_high: number;
  partners: { name: string; kind: string; n: number }[];
};

export type AlertRow = {
  ac_key: string; ac_enabled: boolean; ac_value: number; ac_threshold: number;
  ac_over: boolean; ac_due: boolean; ac_detail: string;
};

export const ALERT_LABELS: Record<string, string> = {
  erros_hora: 'Erros do app',
  cadastros_queda: 'Queda nos cadastros',
  jobs_falhando: 'Jobs ou funções falhando',
  suporte_atrasado: 'Suporte atrasado',
};

// O relatório sai na execução das 8h de segunda em Brasília.
export function isDigestTime(hour: number, dow: number): boolean {
  return dow === 1 && hour === 8;
}

export function dueAlerts(rows: AlertRow[]): AlertRow[] {
  return (rows || []).filter((r) => r.ac_enabled && r.ac_over && r.ac_due);
}

// "12 (+3 / +33%)" contra a semana anterior.
export function trend(cur: number, prev: number): string {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  const diff = c - p;
  const sign = diff > 0 ? '+' : '';
  const pctText = p ? ` / ${sign}${Math.round((diff / p) * 100)}%` : '';
  return `${c} (${sign}${diff}${pctText})`;
}

export function digestEmail(m: DigestMetrics): EmailContent {
  const lines = [
    `👋 Cadastros: ${trend(m.signups, m.signups_prev)}`,
    `🏋️ Pessoas que treinaram: ${trend(m.trained, m.trained_prev)}`,
    `📅 Dias de treino: ${trend(m.workouts, m.workouts_prev)}`,
    `🐞 Erros do app: ${trend(m.errors, m.errors_prev)}`,
    `🎧 Suporte: ${m.support_open} aberto(s)${m.support_late ? `, ${m.support_late} há mais de 48 h` : ''}`,
    `⚠️ Risco alto de abandono: ${m.risk_high} pessoa(s)`,
  ];
  if (m.nps_answers) lines.push(`⭐ NPS da semana: ${m.nps} (${m.nps_answers} resposta(s))`);
  const paragraphs = [`Semana até hoje, comparada com a anterior (sem contas de admin):`, ...lines];
  if (m.new_errors?.length) {
    paragraphs.push(`Erros novos na semana: ${m.new_errors.map((e) => `“${e.message}” (${e.n}×)`).join('; ')}`);
  }
  if (m.partners?.length) {
    paragraphs.push(`Parceiros em destaque: ${m.partners.map((p) => `${p.name} (${p.n} indicação(ões))`).join(', ')}`);
  }
  return {
    subject: `EAFIT · resumo da semana: ${m.signups} cadastro(s), ${m.trained} treinando`,
    preheader: `Cadastros ${trend(m.signups, m.signups_prev)} · suporte ${m.support_open} aberto(s)`,
    eyebrow: 'Relatório da equipe',
    heading: 'Resumo da semana',
    paragraphs,
    cta: { label: 'Abrir o painel', url: ADMIN_URL },
    reason: 'Você recebe este e-mail por ser admin do EAFIT. Desligue em Sistema → Relatórios e alertas.',
  };
}

export function alertEmail(alerts: AlertRow[]): EmailContent {
  const names = alerts.map((a) => ALERT_LABELS[a.ac_key] || a.ac_key);
  return {
    subject: `⚠️ EAFIT · alerta: ${names.join(', ')}`,
    preheader: alerts.map((a) => a.ac_detail).join(' · '),
    eyebrow: 'Alerta da equipe',
    heading: names.length === 1 ? names[0] : 'Alertas do EAFIT',
    paragraphs: alerts.map((a) => `${ALERT_LABELS[a.ac_key] || a.ac_key}: ${a.ac_detail} (limite: ${a.ac_threshold}).`),
    cta: { label: 'Ver no painel', url: `${ADMIN_URL}#/relatorios` },
    reason: 'Você recebe este e-mail por ser admin do EAFIT. Desligue em Sistema → Relatórios e alertas.',
  };
}
