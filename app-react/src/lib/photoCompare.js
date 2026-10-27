import { MEASURE_FIELDS } from './bodyMeasurements';

const DAY_MS = 24 * 60 * 60 * 1000;

// Dias entre duas datas 'YYYY-MM-DD' (meio-dia local, sem variar com horário
// de verão). Negativo se `to` for anterior a `from`.
export function daysBetween(from, to) {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.round((b - a) / DAY_MS);
}

// Registro mais recente em ou antes de `date` (rows em ordem crescente por
// `field`). Sem nenhum antes dela, usa o primeiro registro — para a foto mais
// antiga ainda ter uma referência.
export function recordAt(rows, field, date) {
  if (!rows?.length) return null;
  let found = null;
  for (const r of rows) {
    if (r[field] <= date) found = r; else break;
  }
  return found || rows[0];
}

const diffOf = (before, after) => Math.round((after - before) * 10) / 10;

// Diferença entre duas fotos: tempo, peso e cada medida corporal (o registro
// mais próximo de cada data). Campos sem valor nas duas pontas ficam de fora.
export function buildComparison({ before, after, weightLogs = [], measurements = [] }) {
  if (!before || !after) return null;

  const wB = recordAt(weightLogs, 'log_date', before.photo_date);
  const wA = recordAt(weightLogs, 'log_date', after.photo_date);
  const weight = wB && wA && Number.isFinite(wB.peso) && Number.isFinite(wA.peso) && wB !== wA
    ? { before: wB.peso, after: wA.peso, diff: diffOf(wB.peso, wA.peso) }
    : null;

  const mB = recordAt(measurements, 'measured_on', before.photo_date);
  const mA = recordAt(measurements, 'measured_on', after.photo_date);
  const measures = mB && mA && mB !== mA
    ? MEASURE_FIELDS
      .filter(({ key }) => Number.isFinite(mB[key]) && Number.isFinite(mA[key]))
      .map(({ key, label }) => ({ key, label, before: mB[key], after: mA[key], diff: diffOf(mB[key], mA[key]) }))
    : [];

  return { days: daysBetween(before.photo_date, after.photo_date), weight, measures };
}
