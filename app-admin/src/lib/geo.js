import { db } from './supabase';
import { BR_STATES } from './brazilStates';

// Localização de visitas e contas (Dashboard → Localização). RPCs em
// supabase/migrations/20261105010000_visit_geo.sql; o IP é capturado pelo
// banco e convertido em país/estado/cidade pela Edge Function resolve-geo.

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export const fetchVisitGeo = (days = 30) => rpcRows('admin_visit_geo', { days_back: days });
export const fetchUserGeo = (days = 30) => rpcRows('admin_user_geo', { days_back: days });

export const UF_NAMES = Object.fromEntries(BR_STATES.map(s => [s.uf, s.name]));

export const SEXO_LABELS = { M: 'Masculino', F: 'Feminino', 'não informado': 'Não informado' };
export const AGE_BANDS = ['14–17', '18–24', '25–34', '35–44', '45–54', '55+', 'não informado'];

let regionNames = null;
export function countryName(code) {
  if (!code) return 'Sem localização';
  try {
    regionNames ||= new Intl.DisplayNames(['pt-BR'], { type: 'region' });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

// "BR" → 🇧🇷 (letras regionais do Unicode).
export function flag(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return '';
  return String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function rank(map, build) {
  return [...map.entries()].map(build).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

// Linhas das RPCs (status, country, uf, region, city, <countKey>) → totais do
// mapa e das listas. `uf` filtra cidades e demografia por um estado.
export function summarizeGeo(rows, countKey = 'visits', uf = null) {
  let total = 0, located = 0, pending = 0, brTotal = 0, brNoUf = 0;
  const byUf = new Map();
  const byCountry = new Map();
  const byCity = new Map();

  for (const r of rows || []) {
    const n = Number(r[countKey]) || 0;
    total += n;
    if (r.status === 'pendente') { pending += n; continue; }
    if (r.status !== 'ok' || !r.country) continue;
    located += n;
    byCountry.set(r.country, (byCountry.get(r.country) || 0) + n);
    if (r.country === 'BR') {
      brTotal += n;
      if (r.uf) byUf.set(r.uf, (byUf.get(r.uf) || 0) + n);
      else brNoUf += n;
    }
    if (r.city && (!uf || r.uf === uf)) {
      const key = `${r.city}|${r.uf || r.region || ''}|${r.country}`;
      const cur = byCity.get(key) || { city: r.city, place: r.uf || r.region || '', country: r.country, total: 0 };
      cur.total += n;
      byCity.set(key, cur);
    }
  }

  return {
    total, located, pending, noLocation: total - located - pending,
    brTotal, brNoUf,
    byUf,
    maxUf: Math.max(0, ...byUf.values()),
    states: rank(byUf, ([code, n]) => ({ uf: code, label: UF_NAMES[code] || code, total: n, pct: pct(n, brTotal) })),
    countries: rank(byCountry, ([code, n]) => ({ code, label: countryName(code), flag: flag(code), total: n, pct: pct(n, located) })),
    cities: [...byCity.values()].sort((a, b) => b.total - a.total || a.city.localeCompare(b.city)),
  };
}

// Sexo e faixa etária das contas (só no modo Contas), opcionalmente de um estado.
export function demographics(rows, uf = null) {
  const sexo = new Map();
  const faixa = new Map();
  let sum = 0;
  for (const r of rows || []) {
    if (uf && r.uf !== uf) continue;
    const n = Number(r.users) || 0;
    sum += n;
    sexo.set(r.sexo, (sexo.get(r.sexo) || 0) + n);
    faixa.set(r.faixa, (faixa.get(r.faixa) || 0) + n);
  }
  return {
    total: sum,
    sexo: rank(sexo, ([v, n]) => ({ value: v, label: SEXO_LABELS[v] || v, total: n, pct: pct(n, sum) })),
    faixa: AGE_BANDS.filter(b => faixa.has(b)).map(b => ({ value: b, label: b, total: faixa.get(b), pct: pct(faixa.get(b), sum) })),
  };
}

// Degrau de cor (0 = sem dado, 1–5) proporcional ao estado com mais registros.
export const COLOR_STEPS = 5;
export function colorStep(value, max) {
  if (!value || !max) return 0;
  return Math.min(COLOR_STEPS, Math.max(1, Math.ceil((value / max) * COLOR_STEPS)));
}

// Faixas da legenda: [de, até] de cada degrau, a partir do máximo.
export function legendSteps(max) {
  if (!max) return [];
  const out = [];
  for (let s = 1; s <= COLOR_STEPS; s++) {
    const from = Math.floor(((s - 1) / COLOR_STEPS) * max) + 1;
    const to = Math.floor((s / COLOR_STEPS) * max);
    if (to >= from) out.push({ step: s, from, to });
  }
  return out;
}
