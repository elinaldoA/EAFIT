import { db } from './supabase';
import { saveSetting } from './appSettings';

// Custos e uso (Sistema → Custos). SQL em
// supabase/migrations/20261128220000_usage_costs.sql. Preços e cotas são do
// plano informado no painel (os padrões abaixo seguem supabase.com/pricing;
// conferir lá quando mudar).

const GB = 1024 ** 3;

export const PLAN_PRESETS = {
  Free: { plan: 'Free', baseUsd: 0, quotas: { dbGb: 0.5, storageGb: 1, mau: 50000 }, overUsd: { dbGb: 0, storageGb: 0, mau: 0 } },
  Pro: { plan: 'Pro', baseUsd: 25, quotas: { dbGb: 8, storageGb: 100, mau: 100000 }, overUsd: { dbGb: 0.125, storageGb: 0.021, mau: 0.00325 } },
};

export const METRICS = [
  { key: 'dbGb', label: 'Banco de dados', unit: 'GB', field: 'dbBytes' },
  { key: 'storageGb', label: 'Arquivos (Storage)', unit: 'GB', field: 'storageBytes' },
  { key: 'mau', label: 'Usuários ativos no mês', unit: 'MAU', field: 'mau' },
];

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function normalizePlan(value) {
  const base = PLAN_PRESETS[value?.plan] || PLAN_PRESETS.Free;
  return {
    plan: value?.plan || base.plan,
    baseUsd: num(value?.baseUsd, base.baseUsd),
    usdBrl: num(value?.usdBrl, 5.5),
    quotas: Object.fromEntries(METRICS.map(m => [m.key, num(value?.quotas?.[m.key], base.quotas[m.key])])),
    overUsd: Object.fromEntries(METRICS.map(m => [m.key, num(value?.overUsd?.[m.key], base.overUsd[m.key])])),
  };
}

export function mapUsage(r) {
  return {
    dbBytes: num(r?.um_db_bytes), storageBytes: num(r?.um_storage_bytes), storageObjects: num(r?.um_storage_objects),
    users: num(r?.um_users), mau: num(r?.um_mau), push: num(r?.um_push),
  };
}

export function mapSnapshot(r) {
  return {
    day: r.day, dbBytes: num(r.db_bytes), storageBytes: num(r.storage_bytes), storageObjects: num(r.storage_objects),
    users: num(r.users), mau: num(r.mau), push: num(r.push_devices),
  };
}

// Valor da métrica na unidade da cota (GB ou pessoas).
export function metricValue(usage, metric) {
  const v = usage[metric.field] || 0;
  return metric.unit === 'GB' ? v / GB : v;
}

// Uso x cota, excedente e custo estimado do mês (USD e R$).
export function estimateCost(usage, plan) {
  const lines = METRICS.map(m => {
    const used = metricValue(usage, m);
    const quota = plan.quotas[m.key];
    const over = Math.max(0, used - quota);
    return {
      ...m, used, quota, pct: quota > 0 ? Math.round((used / quota) * 100) : null,
      over, overUsd: Math.round(over * plan.overUsd[m.key] * 100) / 100,
    };
  });
  const usd = Math.round((plan.baseUsd + lines.reduce((a, l) => a + l.overUsd, 0)) * 100) / 100;
  return { lines, usd, brl: Math.round(usd * plan.usdBrl * 100) / 100 };
}

// Ritmo de crescimento por dia (mínimos quadrados nos retratos) e em quantos
// dias chega na cota. null quando não há dados ou não está crescendo.
export function projectQuota(snapshots, metric, quota) {
  const pts = snapshots.map(s => ({ t: Date.parse(`${s.day}T12:00:00Z`) / 86400000, y: metricValue(s, metric) }));
  if (pts.length < 2) return null;
  const n = pts.length;
  const mt = pts.reduce((a, p) => a + p.t, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const den = pts.reduce((a, p) => a + (p.t - mt) ** 2, 0);
  if (!den) return null;
  const perDay = pts.reduce((a, p) => a + (p.t - mt) * (p.y - my), 0) / den;
  const last = pts[pts.length - 1].y;
  if (perDay <= 0) return { perDay, daysToQuota: null };
  return { perDay, daysToQuota: last >= quota ? 0 : Math.ceil((quota - last) / perDay) };
}

export async function fetchCosts() {
  const [now, snaps, setting] = await Promise.all([
    db.rpc('admin_usage_now'),
    db.from('usage_snapshots').select('*').order('day', { ascending: true }).limit(120),
    db.from('app_settings').select('value').eq('key', 'cost_plan').maybeSingle(),
  ]);
  if (now.error) throw now.error;
  return {
    usage: mapUsage(now.data?.[0]),
    snapshots: (snaps.data || []).map(mapSnapshot),
    plan: normalizePlan(setting.data?.value),
  };
}

export function saveCostPlan(plan, adminId) {
  return saveSetting('cost_plan', plan, adminId);
}
