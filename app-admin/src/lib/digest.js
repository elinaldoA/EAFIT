import { db } from './supabase';

// Relatório semanal e alertas da equipe (Sistema → Relatórios e alertas).
// SQL em supabase/migrations/20261128100000_admin_digest_alerts.sql; envio em
// supabase/functions/send-admin-digest (textos em _shared/adminDigest.ts).

export const ALERT_RULES = {
  erros_hora: { label: 'Erros do app', unit: 'erros na última hora', hint: 'Dispara quando passa do limite.' },
  cadastros_queda: { label: 'Queda nos cadastros', unit: '% de queda (7 dias contra os 7 anteriores)', hint: 'Só com 10+ cadastros na semana anterior.' },
  jobs_falhando: { label: 'Jobs ou funções falhando', unit: 'falhas na última hora', hint: 'Jobs agendados com falha e respostas 5xx das funções.' },
  suporte_atrasado: { label: 'Suporte atrasado', unit: 'itens abertos há mais de 48 h', hint: 'Dispara quando passa do limite.' },
};

export const LOG_LABELS = { ...Object.fromEntries(Object.entries(ALERT_RULES).map(([k, v]) => [k, v.label])), relatorio: 'Relatório semanal' };

export function trend(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  return { value: c, diff: c - p, pct: p ? Math.round(((c - p) / p) * 100) : null };
}

async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function fetchDigestPage(adminId) {
  const [preview, status, rules, log, prefs] = await Promise.all([
    rpc('admin_digest_preview'),
    rpc('admin_alert_status'),
    db.from('admin_alert_rules').select('key, enabled, threshold, cooldown_hours, last_fired_at'),
    db.from('admin_alert_log').select('id, key, value, threshold, detail, notified, created_at').order('created_at', { ascending: false }).limit(50),
    db.from('admin_notify_prefs').select('weekly_digest, alerts').eq('user_id', adminId).maybeSingle(),
  ]);
  for (const r of [rules, log, prefs]) if (r.error) throw r.error;
  const statusByKey = Object.fromEntries((status || []).map(s => [s.ac_key, s]));
  return {
    preview: preview || {},
    rules: (rules.data || [])
      .filter(r => ALERT_RULES[r.key])
      .map(r => ({
        key: r.key, enabled: r.enabled, threshold: Number(r.threshold), cooldownHours: r.cooldown_hours, lastFiredAt: r.last_fired_at,
        value: statusByKey[r.key] ? Number(statusByKey[r.key].ac_value) : null,
        over: !!statusByKey[r.key]?.ac_over, detail: statusByKey[r.key]?.ac_detail || '',
      }))
      .sort((a, b) => Object.keys(ALERT_RULES).indexOf(a.key) - Object.keys(ALERT_RULES).indexOf(b.key)),
    log: log.data || [],
    prefs: { weeklyDigest: prefs.data?.weekly_digest ?? true, alerts: prefs.data?.alerts ?? true },
  };
}

export async function savePrefs(adminId, prefs) {
  const { error } = await db.from('admin_notify_prefs').upsert({
    user_id: adminId, weekly_digest: prefs.weeklyDigest, alerts: prefs.alerts, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveRule(key, { enabled, threshold, cooldownHours }) {
  const t = Number(threshold);
  const c = Number(cooldownHours);
  if (!Number.isFinite(t) || t < 0) throw new Error('Limite inválido.');
  if (!Number.isInteger(c) || c < 1 || c > 168) throw new Error('Repetição: de 1 a 168 horas.');
  const { error } = await db.from('admin_alert_rules')
    .update({ enabled, threshold: t, cooldown_hours: c, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw error;
}

export async function sendDigestToMe() {
  const { data, error } = await db.functions.invoke('send-admin-digest', { body: { mode: 'digest_me' } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
