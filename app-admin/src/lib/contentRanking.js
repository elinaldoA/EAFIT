import { db } from './supabase';
import { defaultDemoFor } from './exerciseMedia';

// Conteúdo → Ranking e qualidade: o que funciona na biblioteca e nos planos e
// o que falta completar. SQL em
// supabase/migrations/20261128050000_exercise_ranking_quality.sql.

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

// Abaixo disso de vezes planejado, a taxa de pulo não entra em "mais pulados"
// (amostra pequena engana).
export const MIN_PLANNED = 5;

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export function buildExerciseRanking(rows) {
  const items = (rows || []).map(r => {
    const planned = Number(r.er_planned) || 0;
    const done = Number(r.er_done) || 0;
    return {
      name: r.er_name,
      inPlans: Number(r.er_in_plans) || 0,
      planned,
      done,
      users: Number(r.er_users) || 0,
      skipPct: planned ? 100 - pct(done, planned) : null,
      swappedOut: Number(r.er_swapped_out) || 0,
      swappedIn: Number(r.er_swapped_in) || 0,
      pain: Number(r.er_pain) || 0,
    };
  });
  const by = (key, filter = () => true) => [...items].filter(filter).sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name));
  return {
    items,
    mostDone: by('done', i => i.done > 0).slice(0, 15),
    mostSkipped: by('skipPct', i => i.planned >= MIN_PLANNED && i.skipPct > 0).slice(0, 15),
    mostSwapped: by('swappedOut', i => i.swappedOut > 0).slice(0, 15),
    mostPain: by('pain', i => i.pain > 0).slice(0, 15),
  };
}

export function buildPlanRanking(rows) {
  return (rows || []).map(r => {
    const planned = Number(r.pr_planned) || 0;
    const finished = Number(r.pr_finished) || 0;
    return {
      name: r.pr_name,
      plans: Number(r.pr_plans) || 0,
      users: Number(r.pr_users) || 0,
      byTrainer: Number(r.pr_by_trainer) || 0,
      adherencePct: pct(Number(r.pr_done) || 0, planned),
      finished,
      finishedActivePct: pct(Number(r.pr_finished_active) || 0, finished),
    };
  }).sort((a, b) => b.plans - a.plans || a.name.localeCompare(b.name));
}

export const ISSUE_LABELS = {
  no_media: 'Sem demonstração',
  no_equipment: 'Sem equipamento',
  short_tech: 'Técnica curta',
};

// Pendências por exercício: demonstração = mídia própria ou a padrão do app.
// Ordem: mais pessoas com o exercício no plano primeiro, depois mais pendências.
export function buildQualityQueue(rows) {
  const queue = (rows || []).map(r => {
    const issues = [];
    if (!r.lq_custom_media && !defaultDemoFor(r.lq_name)) issues.push('no_media');
    if (r.lq_no_equipment && !r.lq_post && r.lq_type !== 'cardio') issues.push('no_equipment');
    if (r.lq_short_tech) issues.push('short_tech');
    return { name: r.lq_name, group: r.lq_group, type: r.lq_type, post: !!r.lq_post, inPlans: Number(r.lq_in_plans) || 0, issues };
  }).filter(i => i.issues.length > 0)
    .sort((a, b) => b.inPlans - a.inPlans || b.issues.length - a.issues.length || a.name.localeCompare(b.name));
  const total = (rows || []).length;
  const count = key => queue.filter(i => i.issues.includes(key)).length;
  return {
    total,
    queue,
    counts: Object.fromEntries(Object.keys(ISSUE_LABELS).map(k => [k, count(k)])),
    completePct: pct(total - queue.length, total),
  };
}

export async function fetchContentRanking(days = 30) {
  const [ex, plans, quality] = await Promise.all([
    rpcRows('admin_exercise_ranking', { days_back: days }),
    rpcRows('admin_plan_ranking', { days_back: Math.max(days, 90) }),
    rpcRows('admin_library_quality'),
  ]);
  return { exercises: buildExerciseRanking(ex), plans: buildPlanRanking(plans), quality: buildQualityQueue(quality) };
}
