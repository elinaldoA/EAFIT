import { db } from '../../lib/supabase';
import { t, decimal } from '../../lib/i18n';
import { RACE_NAME_MAX } from './race';

// Próximas corridas perto de você (tabela run_events, aprovadas pelo admin).
// A lista vem do Supabase; distância e filtros são calculados aqui, no aparelho.
// A posição da pessoa nunca sai do aparelho: fica arredondada a 0,1° no
// localStorage e só serve para ordenar e filtrar a lista.

export const EVENT_RADII = [25, 50, 100, 200];
export const DEFAULT_RADIUS = 50;
export const LOC_KEY = 'eafit_run_events_loc';

// Faixas dos botões 5K / 10K / 21K / 42K: uma prova de 6 km entra no 5K.
export const EVENT_BANDS = [
  { key: '5', label: '5K', test: km => km <= 7.5 },
  { key: '10', label: '10K', test: km => km > 7.5 && km <= 15 },
  { key: '21', label: '21K', test: km => km > 15 && km <= 30 },
  { key: '42', label: '42K+', test: km => km > 30 },
];

export function toEvent(row) {
  const lat = row.lat == null ? null : Number(row.lat);
  const lng = row.lng == null ? null : Number(row.lng);
  return {
    id: row.id, name: row.name, date: row.event_date, city: row.city || '', state: row.state || '',
    venue: row.venue || '', lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
    distances: (row.distances || []).map(Number).filter(n => n > 0).sort((a, b) => a - b),
    url: row.url || '', source: row.source || '',
  };
}

export async function fetchRunEvents(today) {
  const { data, error } = await db.from('run_events').select('*')
    .gte('event_date', today).order('event_date', { ascending: true }).limit(600);
  if (error) throw error;
  return (data || []).map(toEvent);
}

export function haversineKm(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const coarse = deg => Math.round(deg * 10) / 10;

// Posição guardada: { lat, lon } (a pessoa deixou usar o GPS) ou { uf } (escolheu o estado).
export function readLocation() {
  try {
    const v = JSON.parse(localStorage.getItem(LOC_KEY) || 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon)) return { lat: v.lat, lon: v.lon };
    if (v && /^[A-Z]{2}$/.test(v.uf || '')) return { uf: v.uf };
  } catch { /* sem storage */ }
  return null;
}

export function writeLocation(loc) {
  try {
    if (loc) localStorage.setItem(LOC_KEY, JSON.stringify(loc.uf ? { uf: loc.uf } : { lat: coarse(loc.lat), lon: coarse(loc.lon) }));
    else localStorage.removeItem(LOC_KEY);
  } catch { /* sem storage */ }
}

// Estado da pessoa a partir da posição: o da prova com coordenadas mais próxima (até 300 km).
// A posição só serve para esse cálculo; quem guarda é só o estado (UF).
export const MAX_STATE_GUESS_KM = 300;
export function stateFromPosition(events, pos) {
  let best = null;
  for (const e of events) {
    if (!e.state || e.lat == null || e.lng == null) continue;
    const km = haversineKm(pos, { lat: e.lat, lon: e.lng });
    if (!best || km < best.km) best = { km, state: e.state };
  }
  return best && best.km <= MAX_STATE_GUESS_KM ? best.state : '';
}

// Provas ordenadas por data. Com posição, só as que têm coordenadas e estão
// dentro do raio (cada uma ganha `km`); com UF, as do estado; sem nada, todas.
export function nearbyEvents(events, { loc, radius = DEFAULT_RADIUS, band = '' } = {}) {
  const bandTest = EVENT_BANDS.find(b => b.key === band)?.test;
  const out = [];
  for (const e of events) {
    if (bandTest && !e.distances.some(bandTest)) continue;
    if (loc?.uf && e.state !== loc.uf) continue;
    let km = null;
    if (loc && Number.isFinite(loc.lat)) {
      if (e.lat == null || e.lng == null) continue;
      km = haversineKm(loc, { lat: e.lat, lon: e.lng });
      if (km > radius) continue;
    }
    out.push({ ...e, km });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.km ?? 0) - (b.km ?? 0));
}

export function formatEventKm(km) {
  return `${decimal(Math.round(km * 10) / 10)} km`;
}

// Dado de "Sua prova" (user_metadata.runRace) a partir da corrida escolhida.
export function raceFromEvent(event, km) {
  return { name: event.name.slice(0, RACE_NAME_MAX), date: event.date, km: Math.round(Number(km) * 100) / 100 };
}

export function eventPlace(e) {
  return [e.city, e.state].filter(Boolean).join(' · ') || t('Local a confirmar');
}
