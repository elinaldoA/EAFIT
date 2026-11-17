// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderRunSummaryCard } from './runShareCard';

// Canvas falso: aceita qualquer chamada de desenho e guarda os textos escritos.
function fakeCanvas(texts) {
  const grad = { addColorStop: () => {} };
  const ctx = new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'measureText') return text => ({ width: String(text).length * 20 });
      if (prop === 'fillText') return text => { texts.push(String(text)); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (prop in target) return target[prop];
      return () => {};
    },
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx, toBlob: cb => cb(new Blob(['x'], { type: 'image/png' })) };
}

const run = (date, t, dur = 1800) => ({ run_date: date, distance_m: 5000, duration_s: dur, weather: { t, c: 0 } });

describe('cartão do mês para os stories', () => {
  const texts = [];
  let realCreate;
  beforeEach(() => {
    texts.length = 0;
    realCreate = document.createElement.bind(document);
    // Imagens (logo): falham na hora, como sem rede; o cartão segue sem elas.
    vi.stubGlobal('Image', class { set src(_) { setTimeout(() => this.onerror?.(new Error('sem imagem')), 0); } });
    vi.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'canvas' ? fakeCanvas(texts) : realCreate(tag)));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('sem corrida no mês não gera cartão', async () => {
    expect(await renderRunSummaryCard([run('2020-01-01', 20)], '2026-11-17', 'ABC')).toBeNull();
  });

  it('escreve o mês, os km e as faixas de clima', async () => {
    const runs = [run('2026-11-02', 12), run('2026-11-05', 20), run('2026-11-09', 22, 1700), run('2026-11-12', 31, 2100)];
    const blob = await renderRunSummaryCard(runs, '2026-11-17', 'ABC');
    expect(blob).toBeInstanceOf(Blob);
    expect(texts).toContain('20,0'); // 4 corridas de 5 km
    expect(texts.some(x => /Novembro/i.test(x))).toBe(true);
    expect(texts).toContain('CLIMA E RITMO');
    expect(texts).toContain('4 corridas · média de 21°C');
    expect(texts.some(x => /Ameno/.test(x))).toBe(true);
  });

  it('sem corridas com clima o bastante não escreve a parte do clima', async () => {
    await renderRunSummaryCard([{ run_date: '2026-11-02', distance_m: 5000, duration_s: 1800 }], '2026-11-17', 'ABC');
    expect(texts).not.toContain('CLIMA E RITMO');
  });

  it('com 1 corrida com clima o bloco já aparece, no singular', async () => {
    await renderRunSummaryCard([run('2026-11-02', 24)], '2026-11-17', 'ABC');
    expect(texts).toContain('CLIMA E RITMO');
    expect(texts).toContain('1 corrida · 24°C');
  });

  it('o clima do cartão conta só as corridas do mês, não as de meses antigos', async () => {
    const runs = [run('2026-11-02', 24), run('2026-10-05', 12), run('2026-10-06', 14), run('2026-09-01', 30)];
    await renderRunSummaryCard(runs, '2026-11-17', 'ABC');
    expect(texts).toContain('1 corrida · 24°C'); // as de outubro e setembro ficam de fora
    expect(texts.some(x => /Frio|Calor/.test(x))).toBe(false);
  });

  it('com meta do mês no perfil o cartão mostra o progresso (km feitos, meta e porcentagem)', async () => {
    const runs = [run('2026-11-02', 24), run('2026-11-05', 20), run('2026-11-09', 22), run('2026-11-12', 26)]; // 4 x 5 km
    await renderRunSummaryCard(runs, '2026-11-17', 'ABC', 80);
    expect(texts).toContain('META DO MÊS');
    expect(texts).toContain('20,0 / 80 km · 25%');
  });

  it('sem meta ou com a meta já batida: sem meta não aparece; batida mostra 100%', async () => {
    const runs = [run('2026-11-02', 24), run('2026-11-05', 20)]; // 10 km
    await renderRunSummaryCard(runs, '2026-11-17', 'ABC', null);
    expect(texts).not.toContain('META DO MÊS');
    texts.length = 0;
    await renderRunSummaryCard(runs, '2026-11-17', 'ABC', 8);
    expect(texts).toContain('10,0 / 8 km · 100%');
  });

  it('a meta só conta os km do mês, não os de meses anteriores', async () => {
    const runs = [run('2026-11-02', 24), run('2026-10-20', 20), run('2026-10-21', 20)];
    await renderRunSummaryCard(runs, '2026-11-17', 'ABC', 50);
    expect(texts).toContain('5,0 / 50 km · 10%');
  });
});
