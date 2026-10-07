import { db } from './supabase';

import { t } from './i18n';
export const MEASURE_FIELDS = [
  { key: 'cintura', label: t('Cintura') },
  { key: 'quadril', label: t('Quadril') },
  { key: 'peito', label: t('Peito') },
  { key: 'braco', label: t('Braço') },
  { key: 'coxa', label: t('Coxa') },
];

// Converte o que o usuário digitou ("82,5", "", "abc") em número ou null.
export function parseMeasure(raw) {
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).trim().replace(',', '.'));
  return String(raw).trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 10) / 10;
}

// Diferença da medida mais recente em relação à primeira registrada, por campo.
// `rows` em ordem cronológica; só compara campos com pelo menos 2 registros.
export function measurementDeltas(rows) {
  const out = {};
  for (const { key } of MEASURE_FIELDS) {
    const vals = rows.filter(r => Number.isFinite(r[key]));
    if (vals.length < 2) continue;
    const first = vals[0][key];
    const last = vals[vals.length - 1][key];
    out[key] = { first, last, diff: Math.round((last - first) * 10) / 10 };
  }
  return out;
}

export async function fetchMeasurements(userId) {
  const { data, error } = await db
    .from('body_measurements')
    .select('measured_on, cintura, quadril, peito, braco, coxa')
    .eq('user_id', userId)
    .order('measured_on', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => ({
    ...r,
    ...Object.fromEntries(MEASURE_FIELDS.map(({ key }) => [key, r[key] === null ? null : Number(r[key])])),
  }));
}

export async function upsertMeasurement(userId, measuredOn, values) {
  const { error } = await db
    .from('body_measurements')
    .upsert({ user_id: userId, measured_on: measuredOn, ...values }, { onConflict: 'user_id,measured_on' });
  if (error) throw error;
}
