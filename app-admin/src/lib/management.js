import { db } from './supabase';

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export async function fetchKpis(days = 30) {
  return (await rpcRows('admin_kpis', { days_back: days }))[0] || null;
}

export function fetchActivityByDay(days = 30) {
  return rpcRows('admin_activity_by_day', { days_back: days });
}

export function fetchAtRiskUsers(inactiveDays = 14, maxRows = 200) {
  return rpcRows('admin_at_risk_users', { inactive_days: inactiveDays, max_rows: maxRows });
}

export function fetchExpiringPlans(daysAhead = 7) {
  return rpcRows('admin_expiring_plans', { days_ahead: daysAhead });
}

export function fetchTopExercises(days = 30, maxRows = 10) {
  return rpcRows('admin_top_exercises', { days_back: days, max_rows: maxRows });
}

export function fetchProfileDistribution() {
  return rpcRows('admin_profile_distribution');
}

// Variação percentual entre o período atual e o anterior. Sem base anterior
// (0 ou nulo) não há percentual honesto: devolve null e a UI mostra "novo"
// quando o atual > 0.
export function pctChange(cur, prev) {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  const c = Number(cur);
  const p = Number(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return Math.round(((c - p) / p) * 100);
}

// Quanto da base mensal volta toda semana/dia: DAU/MAU e WAU/MAU em %.
export function stickiness(part, mau) {
  const p = Number(part);
  const m = Number(mau);
  if (!Number.isFinite(p) || !Number.isFinite(m) || m === 0) return null;
  return Math.round((p / m) * 100);
}

// Nome para exibir numa linha de tabela: apelido, senão nome completo, senão
// a parte local do e-mail.
export function displayName(row) {
  const apelido = row.apelido?.trim();
  if (apelido) return apelido;
  const full = [row.nome, row.sobrenome].filter(Boolean).join(' ').trim();
  if (full) return full;
  return row.email ? row.email.split('@')[0] : '—';
}

// Agrupa as linhas de admin_profile_distribution por dimensão, já com % e
// ordenadas do maior pro menor.
export function groupDistribution(rows) {
  const out = {};
  for (const r of rows) {
    (out[r.dimension] ||= []).push({ value: r.value, total: Number(r.total) });
  }
  for (const key of Object.keys(out)) {
    const sum = out[key].reduce((a, r) => a + r.total, 0) || 1;
    out[key] = out[key]
      .map(r => ({ ...r, pct: Math.round((r.total / sum) * 100) }))
      .sort((a, b) => b.total - a.total);
  }
  return out;
}
