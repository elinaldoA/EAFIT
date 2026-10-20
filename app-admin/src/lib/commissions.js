import { db } from './supabase';

// Comissões dos parceiros (Pessoas → Comissões): R$ por cadastro ativado
// (indicado no mês que treinou nos 7 primeiros dias). SQL em
// supabase/migrations/20261128150000_commissions.sql.

export const KIND_LABELS = { embaixador: 'Embaixador', influenciador: 'Influenciador' };
export const PAYOUT_LABELS = { pendente: 'Pendente', pago: 'Pago', contestado: 'Contestado' };
export const PAYOUT_BADGE = { pendente: 'badge badge--warning', pago: 'badge badge--ok', contestado: 'badge badge--danger' };

export function currentMonth(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
}

export function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseMoney(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error('Valor inválido.');
  return Math.round(n * 100) / 100;
}

export function mapStatement(r) {
  return {
    id: r.cs_ambassador, name: r.cs_name, kind: r.cs_kind, code: r.cs_code, userId: r.cs_user, active: !!r.cs_active,
    referrals: Number(r.cs_referrals) || 0, activated: Number(r.cs_activated) || 0,
    rate: Number(r.cs_rate) || 0, amount: Number(r.cs_amount) || 0, override: !!r.cs_override,
    payout: r.cs_payout_status ? { amount: Number(r.cs_payout_amount) || 0, status: r.cs_payout_status, paidAt: r.cs_paid_at, notes: r.cs_notes || '' } : null,
  };
}

export function summarize(rows) {
  return rows.reduce((a, r) => ({
    referrals: a.referrals + r.referrals,
    activated: a.activated + r.activated,
    calculated: a.calculated + r.amount,
    paid: a.paid + (r.payout?.status === 'pago' ? r.payout.amount : 0),
    pending: a.pending + (r.payout && r.payout.status !== 'pago' ? r.payout.amount : 0),
    open: a.open + (!r.payout && r.amount > 0 ? 1 : 0),
  }), { referrals: 0, activated: 0, calculated: 0, paid: 0, pending: 0, open: 0 });
}

export async function fetchCommissions(month) {
  const [statement, rules] = await Promise.all([
    db.rpc('admin_commission_statement', { p_month: month }),
    db.from('commission_rules').select('kind, per_activated'),
  ]);
  if (statement.error) throw statement.error;
  if (rules.error) throw rules.error;
  return {
    rows: (statement.data || []).map(mapStatement),
    rules: Object.fromEntries((rules.data || []).map(r => [r.kind, Number(r.per_activated) || 0])),
  };
}

export async function saveRule(kind, value, adminId) {
  const { error } = await db.from('commission_rules')
    .update({ per_activated: parseMoney(value), updated_at: new Date().toISOString(), updated_by: adminId }).eq('kind', kind);
  if (error) throw error;
}

// Valor vazio tira a exceção (volta à regra do tipo).
export async function saveOverride(ambassadorId, value, adminId) {
  if (String(value ?? '').trim() === '') {
    const { error } = await db.from('commission_overrides').delete().eq('ambassador_id', ambassadorId);
    if (error) throw error;
    return;
  }
  const { error } = await db.from('commission_overrides').upsert({
    ambassador_id: ambassadorId, per_activated: parseMoney(value), updated_at: new Date().toISOString(), updated_by: adminId,
  });
  if (error) throw error;
}

// Fecha o mês do parceiro com o valor calculado agora (fica pendente).
export async function closeMonth(row, month, adminId) {
  const { error } = await db.from('commission_payouts').upsert({
    ambassador_id: row.id, month, activated: row.activated, amount: row.amount, status: 'pendente',
    updated_at: new Date().toISOString(), updated_by: adminId,
  });
  if (error) throw error;
}

export async function updatePayout(ambassadorId, month, patch, adminId) {
  const fields = { ...patch, updated_at: new Date().toISOString(), updated_by: adminId };
  if (patch.status === 'pago') fields.paid_at = new Date().toISOString();
  if (patch.status && patch.status !== 'pago') fields.paid_at = null;
  const { error } = await db.from('commission_payouts').update(fields).eq('ambassador_id', ambassadorId).eq('month', month);
  if (error) throw error;
}
