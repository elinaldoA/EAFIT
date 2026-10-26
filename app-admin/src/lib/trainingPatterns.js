import { db } from './supabase';
import { WEEKDAYS } from './planAnalytics';

// Padrões de treino (Análises → Análise dos planos): mapa dia × hora e
// academia × condomínio × casa, e musculação × calistenia. SQL em
// supabase/migrations/20261128040000_admin_training_patterns.sql e
// 20261203010000_admin_modality_breakdown.sql.

export const PLACE_LABELS = { academia: 'Academia', condominio: 'Condomínio', casa: 'Em casa' };
export const MODALITY_LABELS = { musculacao: 'Musculação', calistenia: 'Calistenia' };

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const hh = h => `${String(h).padStart(2, '0')}h`;

// 7 linhas (domingo a sábado) × 24 horas, com o nível de 0 a 4 de cada célula
// para a cor (0 = sem treino).
export function buildHeatmap(rows) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows || []) {
    const d = Number(r.th_dow);
    const h = Number(r.th_hour);
    if (d >= 0 && d < 7 && h >= 0 && h < 24) grid[d][h] += Number(r.th_sessions) || 0;
  }
  const max = Math.max(0, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((a, row) => a + row[h], 0));
  const level = v => (!v || !max ? 0 : Math.min(4, Math.ceil((v / max) * 4)));

  // Melhor hora para lembrete: 1 hora antes do horário em que mais gente começa.
  const peakHour = total ? byHour.indexOf(Math.max(...byHour)) : null;
  // Janela mais calma de 3 horas seguidas entre 6h e 23h (manutenção, deploy).
  let quiet = null;
  if (total) {
    for (let h = 6; h <= 21; h++) {
      const sum = byHour[h] + byHour[h + 1] + byHour[h + 2];
      if (!quiet || sum < quiet.sum) quiet = { start: h, sum };
    }
  }
  let peakCell = null;
  grid.forEach((row, d) => row.forEach((v, h) => { if (v && (!peakCell || v > peakCell.sessions)) peakCell = { dow: d, hour: h, sessions: v }; }));

  return {
    total,
    max,
    rows: grid.map((row, d) => ({ dow: d, label: WEEKDAYS[d], cells: row.map((v, h) => ({ hour: h, sessions: v, level: level(v) })) })),
    peakHour,
    reminderHour: peakHour == null ? null : (peakHour + 23) % 24,
    peakCell: peakCell && { ...peakCell, label: `${WEEKDAYS[peakCell.dow]} ${hh(peakCell.hour)}` },
    quiet: quiet && { start: quiet.start, end: quiet.start + 3, label: `${hh(quiet.start)} às ${hh(quiet.start + 3)}` },
  };
}

// As taxas de uma linha das RPCs de comparação (prefixo pb_ ou mb_).
function rates(r, prefix) {
  const get = k => r[`${prefix}_${k}`];
  const users = Number(get('users')) || 0;
  const cohort = Number(get('cohort')) || 0;
  return {
    users,
    withPlan: Number(get('with_plan')) || 0,
    trained30Pct: pct(Number(get('trained30')) || 0, users),
    neverPct: pct(Number(get('never')) || 0, users),
    sessionsWeek: get('sessions_week') == null ? null : Number(get('sessions_week')),
    cohort,
    retentionPct: pct(Number(get('cohort_active')) || 0, cohort),
    painPct: pct(Number(get('pain')) || 0, users),
  };
}

export function buildPlaces(rows) {
  return Object.keys(PLACE_LABELS).map(place => {
    const r = (rows || []).find(x => x.pb_place === place) || {};
    return { place, label: PLACE_LABELS[place], ...rates(r, 'pb') };
  });
}

// Uma linha por modalidade (sempre as três); sharePct = fatia do total de usuários.
export function buildModalities(rows) {
  const list = Object.keys(MODALITY_LABELS).map(modality => {
    const r = (rows || []).find(x => x.mb_modality === modality) || {};
    return { modality, label: MODALITY_LABELS[modality], ...rates(r, 'mb') };
  });
  const total = list.reduce((a, m) => a + m.users, 0);
  return list.map(m => ({ ...m, sharePct: pct(m.users, total) }));
}

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

// Modalidades à parte do restante: sem a migration aplicada devolve null e só
// esta tabela some (o mapa e a comparação por local continuam).
export async function fetchModalities() {
  try {
    return buildModalities(await rpcRows('admin_modality_breakdown'));
  } catch {
    return null;
  }
}

export async function fetchTrainingPatterns(days = 90) {
  const [heat, places] = await Promise.all([
    rpcRows('admin_training_heatmap', { days_back: days }),
    rpcRows('admin_place_breakdown'),
  ]);
  return { heatmap: buildHeatmap(heat), places: buildPlaces(places) };
}
