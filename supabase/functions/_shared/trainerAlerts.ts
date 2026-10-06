// Regras puras da Edge Function send-trainer-alerts (testáveis sem rede/banco).

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

function line(item: AlertItem): string {
  if (item.kind === 'inactive') return `${item.name} está sem treinar ${item.detail}`;
  if (item.kind === 'pr') return `${item.name} bateu recorde: ${item.detail}`;
  return `${item.name} relatou dor: ${item.detail}`;
}

// Uma única notificação por personal por rodada: específica quando há um alerta,
// resumida quando há vários.
export function buildAlertPush(items: AlertItem[]): { title: string; body: string } {
  if (items.length === 1) {
    const [item] = items;
    const title = item.kind === 'inactive' ? 'Aluno sem treinar' : item.kind === 'pr' ? 'Novo recorde 🏆' : 'Relato de dor ⚠️';
    return { title, body: line(item) + '.' };
  }
  const shown = items.slice(0, 3).map(line);
  const extra = items.length - shown.length;
  const body = shown.join('; ') + (extra > 0 ? `; e mais ${extra}.` : '.');
  return { title: `${items.length} alertas dos seus alunos`, body };
}

export function buildWeeklyPush(s: WeeklySummary): { title: string; body: string } {
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
