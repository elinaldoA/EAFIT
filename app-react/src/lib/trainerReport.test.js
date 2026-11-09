// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import {
  pdfText, reportFileName, buildReportModel, renderReportPdf, shareOrDownloadPdf, REPORT_LOADS, REPORT_WEIGHTS,
} from './trainerReport';

const CLIENT = { id: 'c1', name: 'Ana Paula Souza', email: 'ana@x.com' };
const DETAIL = {
  profile: { name: 'Ana', email: 'ana@x.com', peso: '70.5', altura: '165', idade: '30', lesoes: 'Joelho direito', restricoes: 'Sem impacto', emergenciaNome: 'Maria', emergenciaTel: '(11) 98888-7777' },
  plan: { name: 'Hipertrofia A/B', days: 4 },
  loads: Array.from({ length: 14 }, (_, i) => ({ exercise: `Exercício ${i}`, max: 40 + i + 0.5, sessions: 3 })),
};
const SUMMARY = {
  last7: 4, last30: 15, streak: 6, lastDay: '2026-10-14',
  weights: Array.from({ length: 12 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, value: 72 - i * 0.3 })),
  weightDelta: -3.3,
  measureDeltas: { cintura: { first: 90, last: 86.5, diff: -3.5 } },
  checkins: { energy: 3.8, sleep: 3.2, mood: 4.1 },
};
const WEEKS = [{ end: '2026-09-30', count: 3 }, { end: '2026-10-07', count: 4 }, { end: '2026-10-14', count: 5 }];

const model = (over = {}) => buildReportModel({ client: CLIENT, detail: DETAIL, summary: SUMMARY, weeks: WEEKS, today: '2026-10-15', goal: 4, ...over });

describe('pdfText', () => {
  it('tira emojis e troca setas e aspas tipográficas, mantém acentos', () => {
    expect(pdfText('🔥 Treino — hoje → amanhã “ok”')).toBe('Treino - hoje -> amanhã "ok"');
    expect(pdfText('  muitos   espaços ')).toBe('muitos espaços');
    expect(pdfText(null)).toBe('');
  });
});

describe('reportFileName', () => {
  it('slug sem acento, com a data', () => {
    expect(reportFileName('Ana Paula Souza', '2026-10-15')).toBe('relatorio-ana-paula-souza-2026-10-15.pdf');
    expect(reportFileName('José  D’Ávila!', '2026-10-15')).toBe('relatorio-jose-d-avila-2026-10-15.pdf');
    expect(reportFileName('', '2026-10-15')).toBe('relatorio-aluno-2026-10-15.pdf');
  });
});

describe('buildReportModel', () => {
  it('traz números, semanas, plano, peso, medidas, cargas e check-ins', () => {
    const m = model();
    expect(m.name).toBe('Ana Paula Souza');
    expect(m.kpis.map(k => k.value)).toEqual(['4', '15', '6', '14/10']);
    expect(m.goal).toBe(4);
    expect(m.weeks).toEqual([{ label: '30/09', count: 3 }, { label: '07/10', count: 4 }, { label: '14/10', count: 5 }]);
    expect(m.plan).toEqual({ name: 'Hipertrofia A/B', days: 4 });
    expect(m.weight).toEqual(expect.objectContaining({ first: 72, delta: -3.3 }));
    expect(m.measures).toEqual([expect.objectContaining({ label: 'Cintura', first: 90, last: 86.5, diff: -3.5 })]);
    expect(m.checkins.map(c => c.value)).toEqual([3.8, 3.2, 4.1]);
    expect(m.info).toBe('30 anos · 70,5 kg · 165 cm');
  });

  it('limita cargas e pontos de peso', () => {
    const m = model();
    expect(m.loads).toHaveLength(REPORT_LOADS);
    expect(m.weight.points).toHaveLength(REPORT_WEIGHTS);
    expect(m.weight.points.at(-1).value).toBeCloseTo(72 - 11 * 0.3);
  });

  it('NUNCA inclui e-mail, lesões, restrições nem contato de emergência', () => {
    const json = JSON.stringify(model());
    for (const secret of ['ana@x.com', 'Joelho', 'Sem impacto', 'Maria', '98888']) expect(json).not.toContain(secret);
  });

  it('sem dados: seções ficam vazias e os números viram traço', () => {
    const m = model({ detail: { profile: {} }, summary: { last7: 0, last30: 0, streak: 0, lastDay: null, weights: [], weightDelta: null, measureDeltas: {}, checkins: null }, weeks: [], goal: null });
    expect(m.plan).toBeNull();
    expect(m.weight).toBeNull();
    expect(m.measures).toEqual([]);
    expect(m.loads).toEqual([]);
    expect(m.checkins).toBeNull();
    expect(m.kpis.map(k => k.value)).toEqual(['0', '0', '-', '-']);
    expect(m.goal).toBeNull();
  });
});

describe('renderReportPdf', () => {
  it('gera um PDF de verdade (cabeçalho %PDF) com todas as seções', async () => {
    const blob = await renderReportPdf(model());
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(2000);
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
  });

  it('gera mesmo sem nenhum dado e com listas longas (várias páginas)', async () => {
    const empty = await renderReportPdf(model({ detail: { profile: {} }, summary: { last7: 0, last30: 0, streak: 0, lastDay: null, weights: [], weightDelta: null, measureDeltas: {}, checkins: null }, weeks: [], goal: null }));
    expect(empty.size).toBeGreaterThan(1000);
    const big = model();
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
