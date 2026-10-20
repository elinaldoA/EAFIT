import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  fetchVisitGeo, fetchAppGeo, fetchUserGeo, fetchGeoCompare, selectAccessRows, splitSiteApp, summarizeGeo, demographics, colorStep,
  legendSteps, compareGeo, trend, trendLabel, countryName, flag, UF_NAMES,
} from './geo';
import { BR_STATES } from './brazilStates';
import { WORLD_COUNTRIES } from './worldCountries';

beforeEach(() => { mockRpc.mockReset(); });

const visit = (status, country, uf, city, visits, region = null) => ({ page: 'landing', status, country, uf, region, city, visits });

describe('consultas', () => {
  it('passam o período e devolvem lista vazia sem dados', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchVisitGeo(7)).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith('admin_visit_geo', { days_back: 7 });
    await fetchAppGeo(7);
    expect(mockRpc).toHaveBeenCalledWith('admin_app_geo', { days_back: 7 });
    await fetchUserGeo(90);
    expect(mockRpc).toHaveBeenCalledWith('admin_user_geo', { days_back: 90 });
    await fetchGeoCompare(7);
    expect(mockRpc).toHaveBeenCalledWith('admin_geo_period_compare', { days_back: 7 });
  });

  it('propagam o erro da RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    await expect(fetchVisitGeo()).rejects.toThrow('not_authorized');
  });
});

describe('modos do mapa', () => {
  const v = [{ page: 'landing', visits: 3 }, { page: 'acesso', visits: 2 }];
  const a = [{ page: 'app', visits: 5 }];

  it('selectAccessRows filtra por modo', () => {
    expect(selectAccessRows(v, a, 'tudo').map(r => r.page)).toEqual(['landing', 'acesso', 'app']);
    expect(selectAccessRows(v, a, 'site').map(r => r.page)).toEqual(['landing']);
    expect(selectAccessRows(v, a, 'app').map(r => r.page)).toEqual(['acesso', 'app']);
    expect(selectAccessRows(null, null, 'app')).toEqual([]);
  });

  it('splitSiteApp separa site de app (tela de login conta como app)', () => {
    expect(splitSiteApp([...v, ...a])).toEqual({ site: 3, app: 7 });
  });

  it('splitSiteApp filtra por estado ou país', () => {
    const rows = [
      { page: 'landing', country: 'BR', uf: 'SP', visits: 3 },
      { page: 'app', country: 'BR', uf: 'BA', visits: 5 },
      { page: 'acesso', country: 'PT', uf: null, visits: 1 },
    ];
    expect(splitSiteApp(rows, { uf: 'BA' })).toEqual({ site: 0, app: 5 });
    expect(splitSiteApp(rows, { country: 'BR' })).toEqual({ site: 3, app: 5 });
  });
});

describe('mapa do mundo', () => {
  it('tem os países com sigla ISO única e contorno', () => {
    expect(WORLD_COUNTRIES.length).toBeGreaterThan(150);
    expect(new Set(WORLD_COUNTRIES.map(c => c.code)).size).toBe(WORLD_COUNTRIES.length);
    for (const c of WORLD_COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.d).toMatch(/^M[-\d.,LMZ]+Z$/);
    }
    expect(WORLD_COUNTRIES.map(c => c.code)).toEqual(expect.arrayContaining(['BR', 'US', 'PT']));
  });
});

describe('mapa dos estados', () => {
  it('tem os 27 estados com contorno e ponto de rótulo', () => {
    expect(BR_STATES).toHaveLength(27);
    expect(new Set(BR_STATES.map(s => s.uf)).size).toBe(27);
    for (const s of BR_STATES) {
      expect(s.d).toMatch(/^M[\d.,LMZ]+Z$/);
      expect(Number.isFinite(s.cx) && Number.isFinite(s.cy)).toBe(true);
    }
    expect(UF_NAMES.SP).toBe('São Paulo');
  });
});

describe('summarizeGeo', () => {
  const rows = [
    visit('ok', 'BR', 'SP', 'Campinas', 5, 'São Paulo'),
    visit('ok', 'BR', 'SP', 'São Paulo', 3, 'São Paulo'),
    visit('ok', 'BR', 'BA', 'Salvador', 2, 'Bahia'),
    visit('ok', 'BR', null, null, 4),
    visit('ok', 'PT', null, 'Lisboa', 1, 'Lisbon'),
    visit('pendente', null, null, null, 2),
    visit('sem_local', null, null, null, 6),
  ];

  it('separa localizados, pendentes e sem localização', () => {
    const s = summarizeGeo(rows);
    expect(s).toMatchObject({ total: 23, located: 15, pending: 2, noLocation: 6, brTotal: 14, brNoUf: 4, abroad: 1, maxUf: 8 });
  });

  it('ordena estados e países pelo total', () => {
    const s = summarizeGeo(rows);
    expect(s.states.map(x => [x.uf, x.total])).toEqual([['SP', 8], ['BA', 2]]);
    expect(s.countries.map(x => [x.code, x.total])).toEqual([['BR', 14], ['PT', 1]]);
    expect(s.countries[0].pct).toBe(93);
  });

  it('filtra cidades por estado', () => {
    expect(summarizeGeo(rows).cities.map(c => c.city)).toEqual(['Campinas', 'São Paulo', 'Salvador', 'Lisboa']);
    expect(summarizeGeo(rows, 'visits', { uf: 'BA' }).cities).toEqual([{ city: 'Salvador', place: 'BA', country: 'BR', total: 2 }]);
  });

  it('totaliza e filtra cidades por país', () => {
    const s = summarizeGeo(rows);
    expect(s.byCountry.get('PT')).toBe(1);
    expect(s.maxCountry).toBe(14);
    expect(summarizeGeo(rows, 'visits', { country: 'PT' }).cities).toEqual([{ city: 'Lisboa', place: 'Lisbon', country: 'PT', total: 1 }]);
  });

  it('aguenta lista vazia', () => {
    expect(summarizeGeo([])).toMatchObject({ total: 0, located: 0, maxUf: 0, maxCountry: 0, states: [], countries: [], cities: [] });
  });
});

describe('demographics', () => {
  const rows = [
    { status: 'ok', country: 'BR', uf: 'SP', sexo: 'F', faixa: '25–34', users: 3 },
    { status: 'ok', country: 'BR', uf: 'SP', sexo: 'M', faixa: '18–24', users: 1 },
    { status: 'ok', country: 'BR', uf: 'RJ', sexo: 'M', faixa: '55+', users: 2 },
    { status: 'sem_local', country: null, uf: null, sexo: 'não informado', faixa: 'não informado', users: 1 },
  ];

  it('soma sexo com rótulo e faixas na ordem das idades', () => {
    const d = demographics(rows);
    expect(d.total).toBe(7);
    expect(d.sexo.map(x => [x.label, x.total])).toEqual([['Feminino', 3], ['Masculino', 3], ['Não informado', 1]]);
    expect(d.faixa.map(x => x.value)).toEqual(['18–24', '25–34', '55+', 'não informado']);
  });

  it('filtra por estado ou país', () => {
    expect(demographics(rows, { country: 'BR' }).total).toBe(6);
    const d = demographics(rows, { uf: 'SP' });
    expect(d.total).toBe(4);
    expect(d.sexo.map(x => x.value)).toEqual(['F', 'M']);
    expect(d.sexo[0].pct).toBe(75);
  });
});

describe('escala de cor', () => {
  it('colorStep vai de 1 a 5 e 0 sem dado', () => {
    expect(colorStep(0, 10)).toBe(0);
    expect(colorStep(5, 0)).toBe(0);
    expect(colorStep(1, 10)).toBe(1);
    expect(colorStep(5, 10)).toBe(3);
    expect(colorStep(10, 10)).toBe(5);
  });

  it('legendSteps cobre de 1 até o máximo sem faixa vazia', () => {
    expect(legendSteps(10)).toEqual([
      { step: 1, from: 1, to: 2 }, { step: 2, from: 3, to: 4 }, { step: 3, from: 5, to: 6 },
      { step: 4, from: 7, to: 8 }, { step: 5, from: 9, to: 10 },
    ]);
    expect(legendSteps(2).map(s => [s.from, s.to])).toEqual([[1, 1], [2, 2]]);
    expect(legendSteps(0)).toEqual([]);
  });
});

describe('país', () => {
  it('nome em português e bandeira', () => {
    expect(countryName('BR')).toBe('Brasil');
    expect(countryName(null)).toBe('Sem localização');
    expect(flag('BR')).toBe('🇧🇷');
    expect(flag('x')).toBe('');
  });
});

describe('comparação com o período anterior', () => {
  const rows = [
    { page: 'landing', country: 'BR', uf: 'SP', cur: 6, prev: 3 },
    { page: 'app', country: 'BR', uf: 'SP', cur: 2, prev: 1 },
    { page: 'acesso', country: 'BR', uf: null, cur: 1, prev: 0 },
    { page: 'landing', country: 'PT', uf: null, cur: '2', prev: '4' },
    { page: 'outra', country: 'BR', uf: 'RJ', cur: 9, prev: 9 },
  ];

  it('compareGeo soma só as páginas do modo, por estado e país', () => {
    const t = compareGeo(rows);
    expect(t.total).toEqual({ cur: 11, prev: 8 });
    expect(t.byUf.get('SP')).toEqual({ cur: 8, prev: 4 });
    expect(t.byUf.has('RJ')).toBe(false);
    expect(t.byCountry.get('BR')).toEqual({ cur: 9, prev: 4 });
    expect(t.byCountry.get('PT')).toEqual({ cur: 2, prev: 4 });
    expect(compareGeo(rows, 'site').total).toEqual({ cur: 8, prev: 7 });
    expect(compareGeo(rows, 'app').byUf.get('SP')).toEqual({ cur: 2, prev: 1 });
    expect(compareGeo(null).total).toEqual({ cur: 0, prev: 0 });
  });

  it('trend e trendLabel', () => {
    expect(trend(undefined)).toBeNull();
    expect(trend({ cur: 0, prev: 0 })).toBeNull();
    expect(trend({ cur: 3, prev: 0 })).toEqual({ dir: 'new', pct: null });
    expect(trend({ cur: 6, prev: 4 })).toEqual({ dir: 'up', pct: 50 });
    expect(trend({ cur: 0, prev: 4 })).toEqual({ dir: 'down', pct: -100 });
    expect(trend({ cur: 4, prev: 4 })).toEqual({ dir: 'flat', pct: 0 });
    expect(trendLabel(trend({ cur: 6, prev: 4 }))).toBe('↑ 50%');
    expect(trendLabel(trend({ cur: 1, prev: 4 }))).toBe('↓ 75%');
    expect(trendLabel(trend({ cur: 4, prev: 4 }))).toBe('=');
    expect(trendLabel(trend({ cur: 1, prev: 0 }))).toBe('novo');
    expect(trendLabel(null)).toBe('');
  });
});
