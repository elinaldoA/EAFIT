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

// Sistema operacional gravado por detectOS (app e landing). 'desconhecido' =
// visita anterior à coluna existir.
const OS_LABELS = {
  android: 'Android',
  ios: 'iOS (iPhone/iPad)',
  windows: 'Windows',
  mac: 'Mac',
  linux: 'Linux',
  outro: 'Outro',
  desconhecido: 'Não registrado',
};
const OS_KIND = { android: 'celular', ios: 'celular', windows: 'desktop', mac: 'desktop', linux: 'desktop' };

// Linhas (page, os, visits) → uma linha por sistema com landing, tela de
// acesso, total e % do total, mais o resumo celular × desktop (% só sobre as
// visitas com sistema identificado).
export function groupVisitOs(rows) {
  const byOs = new Map();
  (rows || []).forEach(r => {
    const item = byOs.get(r.os) || { os: r.os, label: OS_LABELS[r.os] || r.os, landing: 0, acesso: 0, total: 0 };
    const n = Number(r.visits) || 0;
    if (r.page === 'landing') item.landing += n;
    else if (r.page === 'acesso') item.acesso += n;
    item.total += n;
    byOs.set(r.os, item);
  });
  const all = [...byOs.values()];
  const grand = all.reduce((t, i) => t + i.total, 0);
  const systems = all
    .map(i => ({ ...i, pct: pct(i.total, grand) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const kinds = { celular: 0, desktop: 0 };
  all.forEach(i => { if (OS_KIND[i.os]) kinds[OS_KIND[i.os]] += i.total; });
  const known = kinds.celular + kinds.desktop;
  return {
    systems,
    total: grand,
    mobile: { total: kinds.celular, pct: pct(kinds.celular, known) },
    desktop: { total: kinds.desktop, pct: pct(kinds.desktop, known) },
  };
}

// Nome legível de cada lugar gravado por landing_events (ver
// supabase/migrations/20261018010000_landing_events.sql).
const EVENT_PLACES = {
  nav: 'Menu do topo',
  hero: 'Topo da página',
  sticky: 'Barra fixa (celular)',
  personal: 'Seção Personal',
  cta: 'CTA final',
  rodape: 'Rodapé',
  outro: 'Outro',
};
const REACH_LABELS = {
  personal: 'Chegaram em "Para personais"',
  testimonials: 'Chegaram em "Depoimentos"',
  install: 'Chegaram em "Instalar"',
  faq: 'Chegaram no FAQ',
  cta: 'Chegaram no CTA final',
};

// Linhas (event, place, total) → cliques por lugar (ordenados), instalação
// e alcance das seções (na ordem da página).
export function groupLandingEvents(rows) {
  const clicks = [];
  const reach = [];
  let installClicks = 0;
  let installed = 0;
  (rows || []).forEach(r => {
    const n = Number(r.total) || 0;
    if (r.event === 'cta_click') clicks.push({ place: r.place, label: EVENT_PLACES[r.place] || r.place, total: n });
    else if (r.event === 'reach') reach.push({ place: r.place, label: REACH_LABELS[r.place] || r.place, total: n });
    else if (r.event === 'install_click') installClicks += n;
    else if (r.event === 'install_done') installed += n;
  });
  clicks.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const order = Object.keys(REACH_LABELS);
  reach.sort((a, b) => (order.indexOf(a.place) + 1 || 99) - (order.indexOf(b.place) + 1 || 99));
  return { clicks, reach, installClicks, installed, totalClicks: clicks.reduce((t, c) => t + c.total, 0) };
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
