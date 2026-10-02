// Transforma o retorno das RPCs admin_funnel / admin_retention_cohorts
// (supabase/migrations/20261002020000_admin_funnel_retention.sql) no formato
// que o Dashboard desenha. "Treinou" lá = workout concluído, finalizado ou com
// série marcada — não só aberto (o app cria as linhas da semana ao abrir).

export const FUNNEL_STEPS = [
  { key: 'visits', label: 'Visitaram a tela de acesso' },
  { key: 'signed_up', label: 'Criaram conta' },
  { key: 'confirmed', label: 'Confirmaram o e-mail' },
  { key: 'onboarded', label: 'Preencheram o perfil' },
  { key: 'first_workout', label: 'Fizeram o 1º treino' },
  { key: 'second_workout_7d', label: '2º treino em até 7 dias' },
];

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

// Etapas com % do total e % da etapa anterior, e a etapa onde mais gente se
// perde (menor % da anterior). Sem ninguém no topo do funil, não há "pior".
export function buildFunnel(row) {
  const counts = FUNNEL_STEPS.map(s => Number(row?.[s.key]) || 0);
  const start = counts[0];
  const steps = FUNNEL_STEPS.map((s, i) => ({
    ...s,
    count: counts[i],
    pctOfStart: pct(counts[i], start),
    pctOfPrev: i === 0 ? null : pct(counts[i], counts[i - 1]),
  }));

  let worst = null;
  steps.forEach((s, i) => {
    if (i === 0 || s.pctOfPrev == null) return;
    if (!worst || s.pctOfPrev < worst.pctOfPrev) worst = s;
  });
  return { steps, worstKey: start > 0 && worst ? worst.key : null };
}

// Nome legível de cada origem gravada por lib/pageVisits.js (app) e pelo
// <script> da landing. Origem desconhecida (ex.: ?origem=grupo-academia num
// link montado à mão) aparece como veio.
const SOURCE_LABELS = {
  card: 'Card de treino compartilhado',
  convite: 'Convite (botão no Perfil)',
  landing: 'Veio da landing',
  direto: 'Direto / WhatsApp / sem origem',
  google: 'Google',
  bing: 'Bing',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  'outro-site': 'Outro site',
};

export function sourceLabel(source) {
  return SOURCE_LABELS[source] || source;
}

// Linhas (page, source, visits) → uma linha por origem com landing, tela de
// acesso e total, ordenadas pelo total.
export function groupVisitSources(rows) {
  const bySource = new Map();
  (rows || []).forEach(r => {
    const item = bySource.get(r.source) || { source: r.source, label: sourceLabel(r.source), landing: 0, acesso: 0, total: 0 };
    const n = Number(r.visits) || 0;
    if (r.page === 'landing') item.landing += n;
    else if (r.page === 'acesso') item.acesso += n;
    item.total += n;
    bySource.set(r.source, item);
  });
  return [...bySource.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

// Linhas (cohort_week, week_index) → tabela: coortes da mais nova pra mais
// antiga, uma célula por semana desde o cadastro (null = janela ainda não
// começou), e a média ponderada por semana usando só células completas.
export function pivotRetention(rows) {
  const byWeek = new Map();
  let maxIndex = -1;
  (rows || []).forEach(r => {
    const k = Number(r.week_index);
    maxIndex = Math.max(maxIndex, k);
    if (!byWeek.has(r.cohort_week)) {
      byWeek.set(r.cohort_week, { week: r.cohort_week, size: Number(r.cohort_size) || 0, cells: [] });
    }
    const active = Number(r.active_users) || 0;
    byWeek.get(r.cohort_week).cells[k] = { active, complete: !!r.complete, pct: null };
  });

  const weekIndexes = Array.from({ length: maxIndex + 1 }, (_, i) => i);
  const cohorts = [...byWeek.values()]
    .sort((a, b) => (a.week < b.week ? 1 : -1))
    .map(c => ({
      ...c,
      cells: weekIndexes.map(k => (c.cells[k] ? { ...c.cells[k], pct: pct(c.cells[k].active, c.size) } : null)),
    }));

  const average = weekIndexes.map(k => {
    let active = 0;
    let size = 0;
    cohorts.forEach(c => {
      const cell = c.cells[k];
      if (cell?.complete) { active += cell.active; size += c.size; }
    });
    return size > 0 ? pct(active, size) : null;
  });

  return { weekIndexes, cohorts, average };
}
