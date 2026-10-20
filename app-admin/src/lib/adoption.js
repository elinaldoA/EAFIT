import { db } from './supabase';
import { FEATURE_LABELS } from './behavior';

// Adoção das funcionalidades (Análises → Comportamento): uso no período contra
// o período anterior e quanto quem usa continua treinando. SQL em
// supabase/migrations/20261128030000_admin_feature_adoption.sql.

// Abaixo disso a funcionalidade é "pouco descoberta" (vale dica ou push).
export const LOW_ADOPTION_PCT = 10;

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

export function buildAdoption(rows) {
  const list = rows || [];
  const activeRow = list.find(r => r.fa_feature === '__active__');
  const active = Number(activeRow?.fa_users) || 0;
  const activeTrained = Number(activeRow?.fa_trained7) || 0;
  const byKey = Object.fromEntries(list.filter(r => r.fa_feature !== '__active__').map(r => [r.fa_feature, r]));
  const keys = [...new Set([...Object.keys(FEATURE_LABELS), ...Object.keys(byKey)])];

  const items = keys.map(key => {
    const r = byKey[key];
    const users = Number(r?.fa_users) || 0;
    const prevUsers = Number(r?.fa_prev_users) || 0;
    const trained = Number(r?.fa_trained7) || 0;
    const usedRate = pct(trained, users);
    const notUsedRate = pct(activeTrained - trained, active - users);
    return {
      key,
      label: FEATURE_LABELS[key] || key,
      users,
      prevUsers,
      pct: pct(users, active),
      change: prevUsers ? Math.round(((users - prevUsers) / prevUsers) * 100) : null,
      usedRate,
      notUsedRate,
      // Pontos percentuais a mais de quem usou e treinou nos últimos 7 dias.
      retentionLift: usedRate == null || notUsedRate == null ? null : usedRate - notUsedRate,
      low: active > 0 && pct(users, active) < LOW_ADOPTION_PCT,
    };
  }).sort((a, b) => b.users - a.users || a.label.localeCompare(b.label));

  return { active, activeTrainedPct: pct(activeTrained, active), items, low: items.filter(i => i.low) };
}

export async function fetchAdoption(days = 30) {
  const { data, error } = await db.rpc('admin_feature_adoption', { days_back: days });
  if (error) throw error;
  return buildAdoption(data);
}

// Tutorial: o app registra (user_events, event 'tutorial') cada passo visto
// ('aluno_3'), onde a pessoa pulou ('aluno_pulou_3') e quem concluiu
// ('aluno_fim'). Os números são da lista completa de passos do papel.
export const TUTORIAL_ROLES = {
  aluno: 'Aluno',
  trainer: 'Personal',
  influencer: 'Influenciador',
  ambassador: 'Embaixador',
};

export function buildTutorialFunnel(rows) {
  const list = (rows || []).filter(r => r.event === 'tutorial');
  return Object.entries(TUTORIAL_ROLES).map(([role, label]) => {
    const steps = {};
    let done = 0;
    for (const r of list) {
      const users = Number(r.users) || 0;
      const d = String(r.detail || '');
      if (!d.startsWith(`${role}_`)) continue;
      const rest = d.slice(role.length + 1);
      if (rest === 'fim') { done += users; continue; }
      const skip = rest.match(/^pulou_(\d+)$/);
      const view = rest.match(/^(\d+)$/);
      const n = Number((skip || view || [])[1]);
      if (!n) continue;
      steps[n] = steps[n] || { n, viewed: 0, skipped: 0 };
      if (skip) steps[n].skipped += users; else steps[n].viewed += users;
    }
    const ordered = Object.values(steps).sort((a, b) => a.n - b.n);
    const started = ordered.find(s => s.n === 1)?.viewed || ordered[0]?.viewed || 0;
    const worst = ordered.reduce((w, s) => (s.skipped > (w?.skipped || 0) ? s : w), null);
    return {
      role,
      label,
      started,
      done,
      donePct: pct(done, started),
      steps: ordered.map(s => ({ ...s, pctOfStart: pct(s.viewed, started) })),
      worstStep: worst,
    };
  }).filter(f => f.started > 0 || f.done > 0);
}
