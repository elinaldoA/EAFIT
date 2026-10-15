import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  fetchVisitGeo, fetchAppGeo, fetchUserGeo, selectAccessRows, splitSiteApp, summarizeGeo, demographics, colorStep, legendSteps,
  countryName, flag, UF_NAMES,
} from './geo';
import { BR_STATES } from './brazilStates';

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
    expect(s).toMatchObject({ total: 23, located: 15, pending: 2, noLocation: 6, brTotal: 14, brNoUf: 4, maxUf: 8 });
  });

  it('ordena estados e países pelo total', () => {
    const s = summarizeGeo(rows);
    expect(s.states.map(x => [x.uf, x.total])).toEqual([['SP', 8], ['BA', 2]]);
    expect(s.countries.map(x => [x.code, x.total])).toEqual([['BR', 14], ['PT', 1]]);
    expect(s.countries[0].pct).toBe(93);
  });

  it('filtra cidades por estado', () => {
    expect(summarizeGeo(rows).cities.map(c => c.city)).toEqual(['Campinas', 'São Paulo', 'Salvador', 'Lisboa']);
    expect(summarizeGeo(rows, 'visits', 'BA').cities).toEqual([{ city: 'Salvador', place: 'BA', country: 'BR', total: 2 }]);
  });

  it('aguenta lista vazia', () => {
    expect(summarizeGeo([])).toMatchObject({ total: 0, located: 0, maxUf: 0, states: [], countries: [], cities: [] });
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

  it('filtra por estado', () => {
    const d = demographics(rows, 'SP');
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
