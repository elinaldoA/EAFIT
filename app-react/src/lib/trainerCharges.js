import { db } from './supabase';

import { t, locale } from './i18n';

// Cobrança do personal: controle manual do que cada aluno deve (o app não
// movimenta dinheiro). Valores em centavos, em reais.

export const METHODS = ['pix', 'cash', 'card', 'transfer', 'other'];

export const METHOD_LABEL = {
  pix: 'Pix',
  cash: t('Dinheiro'),
  card: t('Cartão'),
  transfer: t('Transferência'),
  other: t('Outro'),
};

const ERRORS = {
  not_authorized: t('Você não tem vínculo ativo com este aluno.'),
  invalid_description: t('Descreva a cobrança (até 80 caracteres).'),
  invalid_amount: t('Valor inválido.'),
  invalid_due: t('Data inválida.'),
  invalid_months: t('Escolha de 1 a 12 meses.'),
  invalid_method: t('Forma de pagamento inválida.'),
  invalid_text: t('Observação grande demais (até 300 caracteres).'),
  too_many: t('Muitas cobranças em aberto com este aluno. Dê baixa ou cancele alguma antes.'),
  not_found: t('Esta cobrança não pode mais ser alterada.'),
};

export function friendlyChargeError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível concluir. Tente de novo.');
}

// "R$ 150,00"
export function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString(locale, { style: 'currency', currency: 'BRL' });
}

// Texto digitado ("150", "150,5", "1.250,90", "R$ 99,90") -> centavos, ou null
// se não for um valor válido (positivo, até R$ 100.000,00).
export function parseMoney(text) {
  let s = String(text ?? '').replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.250 = mil duzentos e cinquenta
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents >= 1 && cents <= 10_000_000 ? cents : null;
}

// "20/11"
export function formatDue(date) {
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

// Instante ISO (ex.: quando foi pago) -> "20/11" no fuso do aparelho.
export function formatDay(iso) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db_] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db_) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

// open + vencimento passado = em atraso (o servidor só guarda open/paid/cancelled).
export function chargeState(c, today) {
  if (c.status === 'paid') return 'paid';
  if (c.status === 'cancelled') return 'cancelled';
  const due = String(c.due).slice(0, 10);
  if (due < today) return 'overdue';
  return due === today ? 'today' : 'open';
}

export function daysLate(c, today) {
  return Math.max(0, daysBetween(String(c.due).slice(0, 10), today));
}

export const STATE_LABEL = {
  open: t('A vencer'),
  today: t('Vence hoje'),
  overdue: t('Em atraso'),
  paid: t('Pago'),
  cancelled: t('Cancelada'),
};

// Números do topo: a receber (em aberto, no prazo), em atraso, recebido no mês
// corrente e quantos alunos estão em atraso.
export function chargeSummary(rows, today) {
  const month = today.slice(0, 7);
  const out = { upcoming: 0, overdue: 0, overdueCount: 0, overdueClients: 0, receivedMonth: 0 };
  const late = new Set();
  for (const c of rows) {
    const st = chargeState(c, today);
    if (st === 'open' || st === 'today') out.upcoming += c.amount;
    else if (st === 'overdue') { out.overdue += c.amount; out.overdueCount += 1; late.add(c.clientId); }
    else if (st === 'paid' && c.paidAt && localDay(c.paidAt).slice(0, 7) === month) out.receivedMonth += c.amount;
  }
  out.overdueClients = late.size;
  return out;
}

// Mapa aluno -> { count, cents, days } das cobranças em atraso (alimenta a fila "Precisam de você").
export function overdueByClient(rows, today) {
  const map = {};
  for (const c of rows) {
    if (chargeState(c, today) !== 'overdue') continue;
    const e = map[c.clientId] || (map[c.clientId] = { count: 0, cents: 0, days: 0 });
    e.count += 1; e.cents += c.amount; e.days = Math.max(e.days, daysLate(c, today));
  }
  return map;
}

// ISO (UTC) -> "YYYY-MM-DD" no fuso do aparelho.
function localDay(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mapRow = r => ({
  id: r.ch_id, clientId: r.ch_client, name: r.ch_name, trainer: r.ch_trainer, description: r.ch_description,
  amount: r.ch_amount, due: r.ch_due, note: r.ch_note, status: r.ch_status, paidAt: r.ch_paid_at, method: r.ch_method,
});

// ---- personal --------------------------------------------------------------
export async function fetchTrainerCharges(clientId = null) {
  const { data, error } = await db.rpc('trainer_charges', { p_client: clientId });
  if (error) throw error;
  return (data || []).map(mapRow);
}

// Cria a cobrança (ou N mensais) e avisa o aluno por push (melhor esforço: já está salva).
export async function createCharge(clientId, { description, amountCents, due, months = 1, note }) {
  const { error } = await db.rpc('trainer_create_charge', {
    p_client: clientId, p_description: description, p_amount_cents: amountCents,
    p_due: due, p_months: months, p_note: note || null,
  });
  if (error) throw error;
  await pushToClient(clientId, t('Nova cobrança'), t('{v1}: {v2}, vence em {v3}.', { v1: description, v2: formatMoney(amountCents), v3: formatDue(due) }));
}

export async function markChargePaid(id, method = 'pix') {
  const { error } = await db.rpc('trainer_mark_charge_paid', { p_id: id, p_method: method, p_paid_on: null });
  if (error) throw error;
}

export async function reopenCharge(id) {
  const { error } = await db.rpc('trainer_reopen_charge', { p_id: id });
  if (error) throw error;
}

export async function cancelCharge(id) {
  const { error } = await db.rpc('trainer_cancel_charge', { p_id: id });
  if (error) throw error;
}

async function pushToClient(clientId, title, body) {
  try {
    await db.functions.invoke('trainer-push', { body: { client_ids: [clientId], title, body } });
  } catch (err) {
    console.warn('trainer-push:', err);
  }
}

// ---- aluno -----------------------------------------------------------------
export async function fetchMyCharges() {
  const { data, error } = await db.rpc('my_charges');
  if (error) throw error;
  return (data || []).map(mapRow);
}
