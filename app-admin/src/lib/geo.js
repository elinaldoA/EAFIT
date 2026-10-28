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
export const fetchAppGeo = (days = 30) => rpcRows('admin_app_geo', { days_back: days });
export const fetchUserGeo = (days = 30) => rpcRows('admin_user_geo', { days_back: days });
// Período atual × anterior (20261125010000_geo_panel_compare.sql).
export const fetchGeoCompare = (days = 30) => rpcRows('admin_geo_period_compare', { days_back: days });

// Acessos localizados por dia (20261215020000_geo_daily.sql).
export const fetchGeoDaily = (days = 30) => rpcRows('admin_geo_daily', { days_back: days });

// Qual página conta em cada modo do mapa. 'acesso' é a tela de login do app
// (quem chega sem sessão); 'app' são os dias de uso de quem está logado
// (admin_app_geo, de 20261106010000_app_access_geo.sql).
export const ACCESS_PAGES = {
  tudo: ['landing', 'acesso', 'app'],
  site: ['landing'],
  app: ['acesso', 'app'],
};

// Linhas de visitas e de uso do app → só as do modo escolhido.
export function selectAccessRows(visitRows, appRows, mode) {
  const pages = ACCESS_PAGES[mode] || ACCESS_PAGES.tudo;
  return [...(visitRows || []), ...(appRows || [])].filter(r => pages.includes(r.page));
}

// Visitas ao site × acessos ao app (tela de login + logados), pro resumo.
// `place` ({ uf } ou { country }) restringe a um estado ou país.
export function splitSiteApp(rows, place = {}) {
  let site = 0, app = 0;
  for (const r of rows || []) {
    if (!inPlace(r, place)) continue;
    const n = Number(r.visits) || 0;
    if (r.page === 'landing') site += n; else app += n;
  }
  return { site, app };
}

// Regiões do IBGE.
export const REGIONS = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};
const UF_REGION = Object.fromEntries(Object.entries(REGIONS).flatMap(([name, ufs]) => ufs.map(u => [u, name])));

// Totais por estado ({ uf → n } ou { uf → { cur, prev } }) somados por região.
// Sem `trends`, devolve { region, total, pct, ufs } ordenado; pct sobre `whole`.
export function groupByRegion(byUf, whole) {
  const sums = new Map();
  for (const [uf, n] of byUf) {
    const region = UF_REGION[uf];
    if (!region || !n) continue;
    sums.set(region, (sums.get(region) || 0) + n);
  }
  return rank(sums, ([region, n]) => ({ region, label: region, total: n, pct: pct(n, whole) }));
}

// Mesma soma pra comparação com o período anterior: { região → { cur, prev } }.
export function regionTrends(byUfCompare) {
  const out = new Map();
  for (const [uf, v] of byUfCompare || []) {
    const region = UF_REGION[uf];
    if (!region) continue;
    const t = out.get(region) || { cur: 0, prev: 0 };
    t.cur += v.cur; t.prev += v.prev;
    out.set(region, t);
  }
  return out;
}

export const UF_NAMES =Object.fromEntries(BR_STATES.map(s => [s.uf, s.name]));

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

// Filtro de um estado ou de um país (clique no mapa ou na lista).
export function inPlace(r, { uf = null, country = null } = {}) {
  if (uf) return r.uf === uf;
  if (country) return r.country === country;
  return true;
}

// Chave de uma cidade nas listas e na comparação com o período anterior.
export const cityKey = r => `${r.city}|${r.uf || r.region || ''}|${r.country}`;

// Linhas das RPCs (status, country, uf, region, city, <countKey>) → totais dos
// mapas e das listas. `place` ({ uf } ou { country }) filtra as cidades.
export function summarizeGeo(rows, countKey = 'visits', place = {}) {
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
    if (r.city && inPlace(r, place)) {
      const key = cityKey(r);
      const cur = byCity.get(key) || { city: r.city, place: r.uf || r.region || '', country: r.country, total: 0 };
      cur.total += n;
      byCity.set(key, cur);
    }
  }

  return {
    total, located, pending, noLocation: total - located - pending,
    brTotal, brNoUf, abroad: located - brTotal,
    byUf,
    maxUf: Math.max(0, ...byUf.values()),
    byCountry,
    maxCountry: Math.max(0, ...byCountry.values()),
    states: rank(byUf, ([code, n]) => ({ uf: code, label: UF_NAMES[code] || code, total: n, pct: pct(n, brTotal) })),
    countries: rank(byCountry, ([code, n]) => ({ code, label: countryName(code), flag: flag(code), total: n, pct: pct(n, located) })),
    cities: [...byCity.values()].sort((a, b) => b.total - a.total || a.city.localeCompare(b.city)),
  };
}

// Sexo e faixa etária das contas (só no modo Contas), opcionalmente de um
// estado ou de um país.
export function demographics(rows, place = {}) {
  const sexo = new Map();
  const faixa = new Map();
  let sum = 0;
  for (const r of rows || []) {
    if (!inPlace(r, place)) continue;
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

// Visitas ao site × contas que abriram o app, por estado (só localizados no
// Brasil). `rate` = contas a cada 100 visitas; null quando o estado não tem
// visita (não dá pra dividir). Ordena por visitas.
export function conversionByUf(visitRows, userRows) {
  const byUf = new Map();
  const get = uf => {
    if (!byUf.has(uf)) byUf.set(uf, { uf, label: UF_NAMES[uf] || uf, visits: 0, users: 0 });
    return byUf.get(uf);
  };
  for (const r of visitRows || []) {
    if (r.page === 'landing' && r.status === 'ok' && r.country === 'BR' && r.uf) get(r.uf).visits += Number(r.visits) || 0;
  }
  for (const r of userRows || []) {
    if (r.status === 'ok' && r.country === 'BR' && r.uf) get(r.uf).users += Number(r.users) || 0;
  }
  const rows = [...byUf.values()].map(v => ({ ...v, rate: v.visits > 0 ? Math.round((v.users / v.visits) * 1000) / 10 : null }));
  return rows.sort((a, b) => b.visits - a.visits || b.users - a.users || a.label.localeCompare(b.label));
}

// Degrau de cor (0 = sem dado, 1–5) proporcional ao estado (ou país) com mais
// registros.
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

// Linhas de admin_geo_period_compare → atual × anterior no total, por estado e
// por país, só com as páginas do modo.
export function compareGeo(rows, mode = 'tudo') {
  const pages = ACCESS_PAGES[mode] || ACCESS_PAGES.tudo;
  const total = { cur: 0, prev: 0 };
  const byUf = new Map();
  const byCountry = new Map();
  const byCity = new Map();
  const add = (map, key, cur, prev) => {
    const v = map.get(key) || { cur: 0, prev: 0 };
    v.cur += cur; v.prev += prev;
    map.set(key, v);
  };
  for (const r of rows || []) {
    if (!pages.includes(r.page) || !r.country) continue;
    const cur = Number(r.cur) || 0;
    const prev = Number(r.prev) || 0;
    total.cur += cur; total.prev += prev;
    add(byCountry, r.country, cur, prev);
    if (r.country === 'BR' && r.uf) add(byUf, r.uf, cur, prev);
    if (r.city) add(byCity, cityKey(r), cur, prev);
  }
  return { total, byUf, byCountry, byCity };
}

// Hoje (fuso de São Paulo, o mesmo do banco) como 'AAAA-MM-DD'.
function todaySp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// Linhas de admin_geo_daily → um ponto por dia dos últimos `days` (zero onde não
// houve acesso), só com as páginas do modo e, se houver, de um estado ou país.
export function dailySeries(rows, days, mode = 'tudo', place = {}, today = todaySp()) {
  const pages = ACCESS_PAGES[mode] || ACCESS_PAGES.tudo;
  const byDay = new Map();
  for (const r of rows || []) {
    if (!pages.includes(r.page) || !inPlace(r, place)) continue;
    byDay.set(r.day, (byDay.get(r.day) || 0) + (Number(r.total) || 0));
  }
  const end = new Date(`${today}T12:00:00Z`);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10);
    out.push({ day, total: byDay.get(day) || 0 });
  }
  return out;
}

// Variação do período anterior pro atual: { dir: 'up' | 'down' | 'flat' | 'new', pct }.
// null quando não houve nada em nenhum dos dois.
export function trend(v) {
  const cur = v?.cur || 0;
  const prev = v?.prev || 0;
  if (!cur && !prev) return null;
  if (!prev) return { dir: 'new', pct: null };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct };
}

export function trendLabel(t) {
  if (!t) return '';
  if (t.dir === 'new') return 'novo';
  if (t.dir === 'flat') return '=';
  return `${t.pct > 0 ? '↑' : '↓'} ${Math.abs(t.pct)}%`;
}
