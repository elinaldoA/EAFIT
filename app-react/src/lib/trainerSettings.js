import { db } from './supabase';

export const INACTIVE_DAY_CHOICES = [3, 5, 7, 10, 14, 21];

export const DEFAULT_SETTINGS = { inactive: true, pr: true, pain: true, weekly: true, days: 7 };

// Frase de apoio sob cada opção de alerta.
export const ALERT_OPTIONS = [
  { key: 'inactive', label: 'Aluno sem treinar', hint: 'Avisa quando um aluno passa o prazo abaixo sem treinar.' },
  { key: 'pr', label: 'Recorde de carga', hint: 'Avisa quando um aluno bate a maior carga dele num exercício.' },
  { key: 'pain', label: 'Relato de dor forte ou lesão', hint: 'Avisa quando um aluno registra desconforto forte ou lesão.' },
  { key: 'weekly', label: 'Resumo da semana', hint: 'Toda segunda, às 8h: quantos alunos treinaram e quem ficou parado.' },
];

export async function fetchTrainerSettings() {
  const { data, error } = await db.rpc('trainer_get_settings');
  if (error) throw error;
  const row = (data || [])[0];
  if (!row) return { ...DEFAULT_SETTINGS };
  return { inactive: !!row.s_inactive, pr: !!row.s_pr, pain: !!row.s_pain, weekly: !!row.s_weekly, days: row.s_days };
}

export async function saveTrainerSettings(s) {
  const { error } = await db.rpc('trainer_set_settings', {
    p_inactive: s.inactive, p_pr: s.pr, p_pain: s.pain, p_weekly: s.weekly, p_days: s.days,
  });
  if (error) throw error;
}

// "Esta semana" para a lista de alunos: quantos treinaram nos últimos 7 dias e
// o total de treinos, a partir do resumo que já vem de trainer_clients_overview.
export function weekOverview(clients) {
  const total = clients.length;
  const active = clients.filter(c => c.days7 > 0).length;
  const sessions = clients.reduce((n, c) => n + (c.days7 || 0), 0);
  return { total, active, sessions, idle: total - active };
}
