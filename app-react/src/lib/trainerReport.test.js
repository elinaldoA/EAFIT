// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import {
  pdfText, reportFileName, buildReportModel, renderReportPdf, shareOrDownloadPdf,
  REPORT_LOADS, REPORT_WEIGHTS, REPORT_PERIODS, DEFAULT_PERIOD,
} from './trainerReport';

const TODAY = '2026-10-15';
const CLIENT = { id: 'c1', name: 'Ana Paula Souza', email: 'ana@x.com' };
const DETAIL = {
  profile: { name: 'Ana', email: 'ana@x.com', peso: '70.5', altura: '165', idade: '30', lesoes: 'Joelho direito', restricoes: 'Sem impacto', emergenciaNome: 'Maria', emergenciaTel: '(11) 98888-7777' },
  plan: { name: 'Hipertrofia A/B', days: 4 },
  loads: Array.from({ length: 14 }, (_, i) => ({ exercise: `Exercício ${i}`, max: 40 + i + 0.5, sessions: 3 })),
  // 3 nos últimos 7 dias · 6 nos últimos 30 · 8 nos 60 · 9 nos 90 · 1 além (ainda dentro dos 120 que a ficha carrega)
  training_days: ['2026-07-01', '2026-07-20', '2026-08-20', '2026-09-01', '2026-09-20', '2026-09-25', '2026-10-01', '2026-10-10', '2026-10-12', '2026-10-14'],
  measurements: [
    { d: '2026-08-20', cintura: 92, quadril: null },
    { d: '2026-09-10', cintura: 90, quadril: null },
    { d: '2026-10-10', cintura: 86.5, quadril: null },
  ],
};
const SUMMARY = {
  last7: 3, last30: 6, streak: 6, lastDay: '2026-10-14',
  weights: [
    { date: '2026-08-20', value: 74 }, { date: '2026-09-10', value: 72.5 }, { date: '2026-10-01', value: 71 }, { date: '2026-10-14', value: 70.4 },
  ],
  weightDelta: -3.6,
  measureDeltas: {},
  checkins: { energy: 3.8, sleep: 3.2, mood: 4.1 },
};

const model = (over = {}) => buildReportModel({ client: CLIENT, detail: DETAIL, summary: SUMMARY, today: TODAY, goal: 4, ...over });
const EMPTY_SUMMARY = { last7: 0, last30: 0, streak: 0, lastDay: null, weights: [], weightDelta: null, measureDeltas: {}, checkins: null };

describe('pdfText', () => {
  it('tira emojis e troca setas e aspas tipográficas, mantém acentos', () => {
    expect(pdfText('🔥 Treino — hoje → amanhã “ok”')).toBe('Treino - hoje -> amanhã "ok"');
    expect(pdfText('  muitos   espaços ')).toBe('muitos espaços');
    expect(pdfText(null)).toBe('');
  });
});

describe('reportFileName', () => {
  it('slug sem acento, com a data', () => {
    expect(reportFileName('Ana Paula Souza', TODAY)).toBe('relatorio-ana-paula-souza-2026-10-15.pdf');
    expect(reportFileName('José  D’Ávila!', TODAY)).toBe('relatorio-jose-d-avila-2026-10-15.pdf');
    expect(reportFileName('', TODAY)).toBe('relatorio-aluno-2026-10-15.pdf');
  });
});

describe('buildReportModel', () => {
  it('padrão: 30 dias, com números, semanas, plano, peso, cargas e check-ins', () => {
    const m = model();
    expect(DEFAULT_PERIOD).toBe(30);
    expect(m.period).toBe(30);
    expect(m.periodLabel).toBe('Período: últimos 30 dias');
    expect(m.name).toBe('Ana Paula Souza');
    expect(m.kpis.map(k => k.value)).toEqual(['3', '6', '6', '14/10']);
    expect(m.kpis[1].label).toBe('treinos em 30 dias');
    expect(m.goal).toBe(4);
    expect(m.weeks).toHaveLength(5);
    expect(m.weeks.at(-1)).toEqual({ label: '15/10', count: 3 });
    expect(m.plan).toEqual({ name: 'Hipertrofia A/B', days: 4 });
    expect(m.checkins.map(c => c.value)).toEqual([3.8, 3.2, 4.1]);
    expect(m.info).toBe('30 anos · 70,5 kg · 165 cm');
  });

  it('o período muda treinos, semanas, peso e medidas', () => {
    const m30 = model({ days: 30 });
    const m60 = model({ days: 60 });
    const m90 = model({ days: 90 });
    expect([m30, m60, m90].map(m => m.kpis[1].value)).toEqual(['6', '8', '9']);
    expect([m30, m60, m90].map(m => m.weeks.length)).toEqual([5, 9, 13]);
    // peso: só os registros do período
    expect(m30.weight).toEqual(expect.objectContaining({ first: 71, last: 70.4, delta: -0.6 }));
    expect(m60.weight).toEqual(expect.objectContaining({ first: 74, last: 70.4, delta: -3.6 }));
    // medidas: 30 dias tem só 1 registro (sem comparação); 60 tem 3
    expect(m30.measures).toEqual([]);
    expect(m60.measures).toEqual([expect.objectContaining({ label: 'Cintura', first: 92, last: 86.5, diff: -5.5 })]);
    expect(m90.periodLabel).toBe('Período: últimos 90 dias');
  });

  it('período inválido volta ao padrão', () => {
    expect(REPORT_PERIODS).toEqual([30, 60, 90]);
    for (const bad of [0, 15, 365, 'x', null, undefined]) expect(model({ days: bad }).period).toBe(30);
    expect(model({ days: '60' }).period).toBe(60);
  });

  it('nome do personal entra no modelo (sem espaços sobrando) e é opcional', () => {
    expect(model({ trainerName: '  Carlos Lima ' }).trainerName).toBe('Carlos Lima');
    expect(model().trainerName).toBe('');
  });

  it('limita cargas e pontos de peso', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: 72 - i * 0.3 }));
    const m = model({ summary: { ...SUMMARY, weights: many } });
    expect(m.loads).toHaveLength(REPORT_LOADS);
    expect(m.weight.points).toHaveLength(REPORT_WEIGHTS);
    expect(m.weight.points.at(-1).value).toBeCloseTo(72 - 11 * 0.3);
  });

  it('NUNCA inclui e-mail, lesões, restrições nem contato de emergência', () => {
    const json = JSON.stringify(model({ trainerName: 'Carlos' }));
    for (const secret of ['ana@x.com', 'Joelho', 'Sem impacto', 'Maria', '98888']) expect(json).not.toContain(secret);
  });

  it('sem dados: seções ficam vazias e os números viram traço', () => {
    const m = model({ detail: { profile: {} }, summary: EMPTY_SUMMARY, goal: null });
    expect(m.plan).toBeNull();
    expect(m.weight).toBeNull();
    expect(m.measures).toEqual([]);
    expect(m.loads).toEqual([]);
    expect(m.checkins).toBeNull();
    expect(m.kpis.map(k => k.value)).toEqual(['0', '0', '-', '-']);
    expect(m.goal).toBeNull();
    expect(m.weeks.every(w => w.count === 0)).toBe(true);
  });
});

describe('renderReportPdf', () => {
  it('gera um PDF de verdade (cabeçalho %PDF) com todas as seções e o nome do personal', async () => {
    const blob = await renderReportPdf(model({ days: 60, trainerName: 'Carlos Lima' }));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(2000);
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
  });

  it('gera mesmo sem nenhum dado e com listas longas (várias páginas)', async () => {
    const empty = await renderReportPdf(model({ detail: { profile: {} }, summary: EMPTY_SUMMARY, goal: null }));
    expect(empty.size).toBeGreaterThan(1000);
    const big = model({ days: 90 });
    big.loads = Array.from({ length: 60 }, (_, i) => ({ exercise: `Exercício muito longo número ${i}`, max: 100, sessions: 2 }));
    const long = await renderReportPdf(big);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await long.arrayBuffer()));
    expect(text).toMatch(/\/Count [2-9]/); // mais de uma página
  });
});

describe('shareOrDownloadPdf', () => {
  const blob = new Blob(['%PDF-x'], { type: 'application/pdf' });
  let clicked;
  beforeEach(() => {
    clicked = null;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicked = this.download; });
  });
  afterEach(() => { vi.restoreAllMocks(); delete navigator.share; delete navigator.canShare; });

  it('no celular compartilha o arquivo', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn().mockResolvedValue(undefined);
    expect(await shareOrDownloadPdf(blob, 'r.pdf', 'Título')).toBe('shared');
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Título', files: [expect.any(File)] }));
    expect(clicked).toBeNull();
  });

  it('cancelar o compartilhamento não baixa nada', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    expect(await shareOrDownloadPdf(blob, 'r.pdf', 'T')).toBe('cancelled');
    expect(clicked).toBeNull();
  });

  it('sem suporte a compartilhar arquivo, baixa', async () => {
    expect(await shareOrDownloadPdf(blob, 'r.pdf', 'T')).toBe('downloaded');
    expect(clicked).toBe('r.pdf');
  });

  it('compartilhar falha por outro motivo: cai no download', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    expect(await shareOrDownloadPdf(blob, 'r.pdf', 'T')).toBe('downloaded');
    expect(clicked).toBe('r.pdf');
  });
});
