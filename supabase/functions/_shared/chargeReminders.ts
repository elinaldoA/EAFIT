// Regras puras da Edge Function send-charge-reminders (testáveis sem rede/banco).

import { type Lang, localeOf } from './lang.ts';

export type ChargeRow = {
  cr_charge: string;
  cr_kind: 'due_soon' | 'due_today' | 'late';
  cr_user: string;
  cr_role: 'client' | 'trainer';
  cr_other: string;
  cr_desc: string;
  cr_cents: number;
  cr_due: string; // YYYY-MM-DD
};

export function formatMoney(cents: number, lang: Lang = 'pt'): string {
  return (cents / 100).toLocaleString(localeOf(lang), { style: 'currency', currency: 'BRL' });
}

// "20/10" (pt) ou "10/20" (en) a partir de YYYY-MM-DD, sem passar por fuso.
export function dueLabel(due: string, lang: Lang = 'pt'): string {
  const [, m, d] = due.split('-');
  return lang === 'en' ? `${m}/${d}` : `${d}/${m}`;
}

function daysLate(due: string, today: string): number {
  const [y1, m1, d1] = due.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// Aluno: uma notificação por cobrança (poucas por dia, e o aluno quer ver cada uma).
export function buildClientPush(r: ChargeRow, lang: Lang = 'pt'): { title: string; body: string } {
  const value = formatMoney(r.cr_cents, lang);
  const today = r.cr_kind === 'due_today';
  if (lang === 'en') {
    return {
      title: today ? 'Payment due today 💰' : 'Payment due tomorrow 💰',
      body: `${r.cr_desc} (${value}) is due ${today ? 'today' : `on ${dueLabel(r.cr_due, lang)}`}. Pay ${r.cr_other} to stay up to date.`,
    };
  }
  return {
    title: today ? 'Pagamento vence hoje 💰' : 'Pagamento vence amanhã 💰',
    body: `${r.cr_desc} (${value}) vence ${today ? 'hoje' : `em ${dueLabel(r.cr_due, lang)}`}. Combine o pagamento com ${r.cr_other}.`,
  };
}

// Personal: uma notificação por rodada, resumida quando há várias.
export function buildLatePush(rows: ChargeRow[], today: string, lang: Lang = 'pt'): { title: string; body: string } {
  const en = lang === 'en';
  const line = (r: ChargeRow) => {
    const n = daysLate(r.cr_due, today);
    const value = formatMoney(r.cr_cents, lang);
    return en
      ? `${r.cr_other} owes ${value} (${n} days late)`
      : `${r.cr_other} deve ${value} (${n} dias de atraso)`;
  };
  if (rows.length === 1) {
    return { title: en ? 'Late payment 💰' : 'Pagamento em atraso 💰', body: line(rows[0]) + '.' };
  }
  const shown = rows.slice(0, 3).map(line);
  const extra = rows.length - shown.length;
  const more = en ? `; and ${extra} more.` : `; e mais ${extra}.`;
  return {
    title: en ? `${rows.length} late payments 💰` : `${rows.length} pagamentos em atraso 💰`,
    body: shown.join('; ') + (extra > 0 ? more : '.'),
  };
}
