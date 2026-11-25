import { Health } from '@capgo/capacitor-health';
import { isNative } from './native';

// Health Connect (app Android), SOMENTE LEITURA: passos, frequência cardíaca e peso.
// Os dados são lidos no aparelho e mostrados na tela; não vão para o servidor
// (a política de privacidade diz isso). Quando mudar os tipos aqui, mude também as
// permissões health.* mantidas no AndroidManifest.xml (as demais são removidas lá).
export const HEALTH_READ = ['steps', 'heartRate', 'weight'];

const dayStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// 'unavailable' (sem Health Connect / fora do app) | 'off' (sem permissão) | 'on'
export async function getHealthState() {
  if (!isNative()) return 'unavailable';
  try {
    const { available } = await Health.isAvailable();
    if (!available) return 'unavailable';
    const { readAuthorized } = await Health.checkAuthorization({ read: HEALTH_READ });
    return readAuthorized.length ? 'on' : 'off';
  } catch {
    return 'unavailable';
  }
}

// Abre a tela de permissões do Health Connect. Devolve o estado depois da resposta.
export async function connectHealth() {
  if (!isNative()) return 'unavailable';
  try {
    const { readAuthorized } = await Health.requestAuthorization({ read: HEALTH_READ });
    return readAuthorized.length ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function openHealthSettings() {
  try { await Health.openHealthConnectSettings(); } catch { /* sem Health Connect */ }
}

const safe = fn => fn().catch(() => null);

// Resumo para o card: passos de hoje e dos últimos 7 dias, frequência cardíaca
// média de hoje e o peso mais recente. Tipo sem permissão ou sem dado vem null.
export async function readHealthSummary(now = new Date()) {
  const today = dayStart(now);
  const from = addDays(today, -6);
  const end = new Date(now);
  const [stepRows, hrRows, weightRows] = await Promise.all([
    safe(() => Health.queryAggregated({ dataType: 'steps', startDate: from.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: 'sum' })),
    safe(() => Health.queryAggregated({ dataType: 'heartRate', startDate: today.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: ['average', 'min', 'max'] })),
    safe(() => Health.readSamples({ dataType: 'weight', startDate: addDays(today, -90).toISOString(), endDate: end.toISOString(), limit: 1 })),
  ]);

  const days = stepRows ? stepRows.samples.map(s => ({ date: s.startDate, steps: Math.round(s.value || 0) })) : null;
  const todaySteps = days ? (days.find(d => new Date(d.date) >= today)?.steps ?? 0) : null;
  const hr = hrRows?.samples?.length ? hrRows.samples[hrRows.samples.length - 1].values : null;
  const w = weightRows?.samples?.[0];
  return {
    days,
    todaySteps,
    heartRate: hr && hr.average ? { avg: Math.round(hr.average), min: Math.round(hr.min || 0), max: Math.round(hr.max || 0) } : null,
    weight: w ? { kg: Math.round(w.value * 10) / 10, date: w.endDate || w.startDate } : null,
  };
}
