// IP → país/estado/cidade pelo ipinfo.io, usado pela Edge Function resolve-geo
// (fila em supabase/migrations/20261105010000_visit_geo.sql).
//
// Funciona com qualquer plano:
//   * com IPINFO_TOKEN: tenta o endpoint completo (estado e cidade vêm nos
//     planos pagos) e, se o token for do plano gratuito (Lite, só país), cai
//     no endpoint /lite;
//   * sem token: API pública legada, com estado e cidade, mas com limite
//     baixo de consultas — serve pra pouco volume.
// Os dois formatos de resposta são aceitos: o completo traz `country` = "BR";
// o Lite traz `country_code` = "BR" e `country` = "Brazil".

export type Geo = { country: string; region: string | null; uf: string | null; city: string | null };

// 'ok' = localizado; 'not_found' = consultado, sem localização (IP reservado,
// bogon…); 'retry' = limite/erro do provedor, tentar na próxima rodada.
export type LookupResult = { kind: 'ok'; geo: Geo } | { kind: 'not_found' } | { kind: 'retry' };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const UF_BY_NAME: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'federal district': 'DF', 'espirito santo': 'ES', goias: 'GO',
  maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  sergipe: 'SE', tocantins: 'TO',
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^(state of|estado d[eo]?)\s+/, '').replace(/\s+/g, ' ').trim();
}

// "São Paulo", "Sao Paulo", "State of São Paulo", "Federal District" → sigla.
export function ufFromRegion(country: string | null, region: string | null | undefined): string | null {
  if (country !== 'BR' || !region) return null;
  return UF_BY_NAME[normalize(region)] ?? null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parseIpinfo(body: unknown): Geo | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.bogon === true) return null;
  const code = [text(b.country_code), text(b.country)].find(c => c && /^[A-Za-z]{2}$/.test(c));
  if (!code) return null;
  const country = code.toUpperCase();
  const region = text(b.region);
  return { country, region, uf: ufFromRegion(country, region), city: text(b.city) };
}

async function getJson(fetchFn: FetchFn, url: string, token?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchFn(url, { headers });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

export async function lookupIp(ip: string, token: string | undefined, fetchFn: FetchFn = fetch): Promise<LookupResult> {
  const enc = encodeURIComponent(ip);
  try {
    const full = await getJson(fetchFn, `https://ipinfo.io/${enc}/json`, token);
    if (full.status === 429) return { kind: 'retry' };
    if (full.status === 200) {
      const geo = parseIpinfo(full.body);
      if (geo) return { kind: 'ok', geo };
      if (!token) return { kind: 'not_found' };
    } else if (!token) {
      return full.status >= 500 ? { kind: 'retry' } : { kind: 'not_found' };
    }

    // Token do plano gratuito: o endpoint completo recusa ou vem sem país.
    const lite = await getJson(fetchFn, `https://api.ipinfo.io/lite/${enc}`, token);
    if (lite.status === 429 || lite.status >= 500) return { kind: 'retry' };
    const geo = lite.status === 200 ? parseIpinfo(lite.body) : null;
    if (geo) return { kind: 'ok', geo };
    return lite.status === 401 || lite.status === 403 ? { kind: 'retry' } : { kind: 'not_found' };
  } catch {
    return { kind: 'retry' };
  }
}
