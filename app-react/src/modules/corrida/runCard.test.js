// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderRunCard, renderRunSummaryCard, canColorTrace } from './runShareCard';

// Canvas falso: aceita qualquer chamada de desenho e guarda textos e se pintou o fundo.
function fakeCanvas(log) {
  const grad = { addColorStop: () => {} };
  const ctx = new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'measureText') return text => ({ width: String(text).length * 20 });
      if (prop === 'fillText') return text => { log.texts.push(String(text)); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => { log.gradients++; return grad; };
      if (prop in target) return target[prop];
      return () => {};
    },
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx, toBlob: cb => cb(new Blob(['x'], { type: 'image/png' })) };
}

const route = [[[100000, 200000, 0], [100100, 200100, 150], [100200, 200200, 330], [100300, 200300, 640], [100400, 200400, 900]]];
const base = {
  run_date: '2026-11-17', started_at: '2026-11-17T08:00:00Z', distance_m: 3000, duration_s: 900,
  route, splits: [300, 280, 320], km_elev: [[20, 0], [5, 5], [0, 30]], elev_gain_m: 25, cadence: 170,
};

describe('cartão da corrida', () => {
  const log = { texts: [], gradients: 0 };
  let realCreate;
  beforeEach(() => {
    log.texts = [];
    log.gradients = 0;
    realCreate = document.createElement.bind(document);
    vi.stubGlobal('Image', class { set src(_) { setTimeout(() => this.onerror?.(new Error('sem imagem')), 0); } });
    vi.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'canvas' ? fakeCanvas(log) : realCreate(tag)));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('com 2 km ou mais mostra o gráfico de ritmo por km, o km mais rápido, a subida e a cadência', async () => {
    expect(await renderRunCard(base, 'ABC')).toBeInstanceOf(Blob);
    expect(log.texts).toContain('RITMO POR KM');
    expect(log.texts).toContain('⚡ Km mais rápido: 4:40 (km 2)');
    expect(log.texts.some(x => x.includes('↗ 25 m de subida') && x.includes('👣 170 passos/min'))).toBe(true);
  });

  it('sem parciais não tem gráfico; subida e cadência vão numa linha embaixo dos números', async () => {
    await renderRunCard({ ...base, splits: [], km_elev: null }, 'ABC');
    expect(log.texts).not.toContain('RITMO POR KM');
    expect(log.texts.some(x => x.includes('↗ 25 m de subida'))).toBe(true);
  });

  it('percurso pintado pelo ritmo ou pela subida ganha legenda; a cor única não', async () => {
    await renderRunCard(base, 'ABC', { trace: 'ritmo' });
    expect(log.texts).toContain('mais lento');
    log.texts = [];
    await renderRunCard(base, 'ABC', { trace: 'elevacao' });
    expect(log.texts).toContain('descida');
    log.texts = [];
    await renderRunCard(base, 'ABC', { trace: 'laranja' });
    expect(log.texts).not.toContain('mais lento');
  });

  it('só diz que dá para pintar se há o dado', () => {
    expect(canColorTrace(base, 'ritmo')).toBe(true);
    expect(canColorTrace(base, 'elevacao')).toBe(true);
    expect(canColorTrace({ ...base, km_elev: null }, 'elevacao')).toBe(false);
    // corrida antiga, sem tempo nos pontos: pinta por km (aproximado) se há parciais
    expect(canColorTrace({ ...base, route: [[[100000, 200000], [100300, 200300]]] }, 'ritmo')).toBe(true);
    expect(canColorTrace({ ...base, route: [[[100000, 200000], [100300, 200300]]], splits: [] }, 'ritmo')).toBe(false);
    expect(canColorTrace(base, 'laranja')).toBe(true);
  });

  it('os selos entram no cartão (opção ou campo da corrida)', async () => {
    await renderRunCard(base, 'ABC', { badges: [{ icon: '🥇', text: 'Melhor 5 km: 23:20' }] });
    expect(log.texts).toContain('🥇 Melhor 5 km: 23:20');
    log.texts = [];
    await renderRunCard({ ...base, badges: [{ icon: '🏆', text: 'Maior distância: 3,00 km' }] }, 'ABC');
    expect(log.texts).toContain('🏆 Maior distância: 3,00 km');
  });

  it('fundo transparente não pinta o fundo do cartão (sem os degradês do fundo escuro)', async () => {
    await renderRunCard(base, 'ABC', { bg: 'transparente' });
    const transparent = log.gradients;
    log.gradients = 0;
    await renderRunCard(base, 'ABC', { bg: 'escuro' });
    expect(transparent).toBeLessThan(log.gradients);
  });

  it('formato quadrado 1:1: canvas de 1080×1080, sem o gráfico', async () => {
    let size;
    document.createElement.mockImplementation(tag => { if (tag !== 'canvas') return realCreate(tag); const c = fakeCanvas(log); size = c; return c; });
    await renderRunCard(base, 'ABC', { format: 'quadrado' });
    expect(size.width).toBe(1080);
    expect(size.height).toBe(1080);
    expect(log.texts).not.toContain('RITMO POR KM');
    expect(log.texts).toContain('Corra com o EAFIT Run');
  });

  it('só números: sem o mapa, a distância grande no lugar', async () => {
    await renderRunCard(base, 'ABC', { style: 'numeros' });
    expect(log.texts).toContain('KM');
  });
});

describe('cartão de resumo por período', () => {
  const log = { texts: [], gradients: 0 };
  let realCreate;
  beforeEach(() => {
    log.texts = [];
    realCreate = document.createElement.bind(document);
    vi.stubGlobal('Image', class { set src(_) { setTimeout(() => this.onerror?.(new Error('sem imagem')), 0); } });
    vi.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'canvas' ? fakeCanvas(log) : realCreate(tag)));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const r = (date, km = 5, sec = 1800) => ({ run_date: date, distance_m: km * 1000, duration_s: sec });
  const runs = [r('2026-11-17', 6), r('2026-11-10'), r('2026-10-06'), r('2026-03-05', 10), r('2025-11-01', 4)];

  it('semana: título com os dias, comparação com a semana passada e meta da semana', async () => {
    await renderRunSummaryCard(runs, '2026-11-18', 'ABC', 20, { period: 'week' });
    expect(log.texts).toContain('MINHA SEMANA DE CORRIDA');
    expect(log.texts).toContain('KM NA SEMANA');
    expect(log.texts).toContain('16/11 – 22/11');
    expect(log.texts).toContain('META DA SEMANA');
    expect(log.texts).toContain('▲ 20% a mais de km que na semana passada');
  });

  it('ano: título com o ano e comparação com o mesmo período do ano passado', async () => {
    await renderRunSummaryCard(runs, '2026-11-18', 'ABC', null, { period: 'year' });
    expect(log.texts).toContain('MEU ANO DE CORRIDA');
    expect(log.texts).toContain('2026');
    expect(log.texts).toContain('KM NO ANO');
    expect(log.texts.some(x => x.startsWith('▲') && x.includes('ano passado'))).toBe(true);
  });

  it('mês: comparação com o mesmo período do mês passado', async () => {
    await renderRunSummaryCard([r('2026-11-02'), r('2026-10-02', 10)], '2026-11-17', 'ABC');
    expect(log.texts).toContain('▼ 50% a menos de km que no mesmo período do mês passado');
  });

  it('sem corridas no período não gera cartão', async () => {
    expect(await renderRunSummaryCard([r('2026-03-05')], '2026-11-18', 'ABC', null, { period: 'week' })).toBeNull();
  });
});
