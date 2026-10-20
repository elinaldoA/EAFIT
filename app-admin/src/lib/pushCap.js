import { db } from './supabase';
import { saveSetting } from './appSettings';

// Limite de avisos por pessoa por semana (app_settings 'push_cap'). Aplicado
// às automáticas em supabase/functions/send-engagement (weeklyCap em
// _shared/engagement.ts — mesma faixa de 1 a 50; 0 = sem limite).
export const CAP_KEY = 'push_cap';
export const MAX_CAP = 50;

export function normalizeCap(value) {
  const n = Number(value?.maxPerWeek);
  return Number.isInteger(n) && n > 0 && n <= MAX_CAP ? n : 0;
}

// Linhas de admin_notification_load → distribuição e quantos já estariam no
// limite (receberam `cap` ou mais avisos em 7 dias).
export function buildLoad(rows, cap) {
  const list = (rows || []).map(r => ({ count: Number(r.nl_count) || 0, users: Number(r.nl_users) || 0 }))
    .sort((a, b) => a.count - b.count);
  const total = list.reduce((a, r) => a + r.users, 0);
  const atCap = cap ? list.filter(r => r.count >= cap).reduce((a, r) => a + r.users, 0) : 0;
  const max = list.reduce((m, r) => Math.max(m, r.count), 0);
  const weighted = list.reduce((a, r) => a + r.count * r.users, 0);
  return { rows: list, total, atCap, max, avg: total ? Math.round((weighted / total) * 10) / 10 : null };
}

export async function fetchPushCap() {
  const [setting, load] = await Promise.all([
    db.from('app_settings').select('value').eq('key', CAP_KEY).maybeSingle(),
    db.rpc('admin_notification_load'),
  ]);
  if (setting.error) throw setting.error;
  if (load.error) throw load.error;
  return { cap: normalizeCap(setting.data?.value), load: load.data || [] };
}

export function savePushCap(cap, adminId) {
  return saveSetting(CAP_KEY, { maxPerWeek: cap }, adminId);
}
