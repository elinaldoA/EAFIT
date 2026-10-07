// Regras puras da Edge Function send-trainer-alerts (testáveis sem rede/banco).

import { type Lang, trExercise } from './lang.ts';

export type AlertItem = { kind: 'inactive' | 'pr' | 'pain'; name: string; detail: string };

export type WeeklySummary = {
  clients: number;
  active: number;
  sessions: number;
  inactive: number;
  top: string | null;
};

// Avisos só em horário comercial de Brasília, pra não acordar ninguém.
export const ALERT_FIRST_HOUR = 8;
export const ALERT_LAST_HOUR = 20;

export function inAlertWindow(hour: number): boolean {
  return hour >= ALERT_FIRST_HOUR && hour <= ALERT_LAST_HOUR;
}

// O resumo semanal sai na segunda-feira (dow 1) às 8h.
export function isWeeklySummaryTime(hour: number, dow: number): boolean {
  return dow === 1 && hour === ALERT_FIRST_HOUR;
}

// O detalhe vem do banco em português ("há 5 dias", "Supino 80 kg",
// "Supino (dor forte)"); em inglês é reescrito e o exercício, traduzido.
export function translateDetail(item: AlertItem, lang: Lang): string {
  if (lang !== 'en') return item.detail;
  if (item.kind === 'inactive') {
    const m = item.detail.match(/^há (\d+) dias?$/);
    return m ? `for ${m[1]} ${m[1] === '1' ? 'day' : 'days'}` : item.detail;
  }
  if (item.kind === 'pr') {
    const m = item.detail.match(/^(.*) (\d+(?:[.,]\d+)?) kg$/);
    return m ? `${trExercise(lang, m[1])} ${m[2]} kg` : item.detail;
  }
  const m = item.detail.match(/^(.*) \((lesão|dor forte)\)$/);
  return m ? `${trExercise(lang, m[1])} (${m[2] === 'lesão' ? 'injury' : 'strong pain'})` : item.detail;
}

function line(item: AlertItem, lang: Lang): string {
  const detail = translateDetail(item, lang);
  if (lang === 'en') {
    if (item.kind === 'inactive') return `${item.name} hasn’t trained ${detail}`;
    if (item.kind === 'pr') return `${item.name} hit a PR: ${detail}`;
    return `${item.name} reported pain: ${detail}`;
  }
  if (item.kind === 'inactive') return `${item.name} está sem treinar ${detail}`;
  if (item.kind === 'pr') return `${item.name} bateu recorde: ${detail}`;
  return `${item.name} relatou dor: ${detail}`;
}

// Uma única notificação por personal por rodada: específica quando há um alerta,
// resumida quando há vários.
export function buildAlertPush(items: AlertItem[], lang: Lang = 'pt'): { title: string; body: string } {
  const en = lang === 'en';
  if (items.length === 1) {
    const [item] = items;
    const title = en
      ? (item.kind === 'inactive' ? 'Client not training' : item.kind === 'pr' ? 'New PR 🏆' : 'Pain report ⚠️')
      : (item.kind === 'inactive' ? 'Aluno sem treinar' : item.kind === 'pr' ? 'Novo recorde 🏆' : 'Relato de dor ⚠️');
    return { title, body: line(item, lang) + '.' };
  }
  const shown = items.slice(0, 3).map((i) => line(i, lang));
  const extra = items.length - shown.length;
  const more = en ? `; and ${extra} more.` : `; e mais ${extra}.`;
  const body = shown.join('; ') + (extra > 0 ? more : '.');
  return { title: en ? `${items.length} alerts from your clients` : `${items.length} alertas dos seus alunos`, body };
}

export function buildWeeklyPush(s: WeeklySummary, lang: Lang = 'pt'): { title: string; body: string } {
  if (lang === 'en') {
    const en = [`${s.active}/${s.clients} clients trained (${s.sessions} ${s.sessions === 1 ? 'workout' : 'workouts'}).`];
    en.push(s.inactive > 0 ? `${s.inactive} didn’t train.` : 'Nobody skipped!');
    if (s.top) en.push(`Top: ${s.top}.`);
    return { title: 'Your clients’ weekly summary', body: en.join(' ') };
  }
  const lines = [`${s.active}/${s.clients} alunos treinaram (${s.sessions} ${s.sessions === 1 ? 'treino' : 'treinos'}).`];
  lines.push(s.inactive > 0 ? `${s.inactive} ${s.inactive === 1 ? 'ficou' : 'ficaram'} sem treinar.` : 'Ninguém ficou parado!');
  if (s.top) lines.push(`Destaque: ${s.top}.`);
  return { title: 'Resumo da semana dos seus alunos', body: lines.join(' ') };
}

// Agrupa linhas por personal, mantendo a ordem.
export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(row);
  }
  return out;
}
