import { MEASURE_FIELDS } from './bodyMeasurements';
import { CHECKIN_FIELDS } from './checkin';
import { fmtDate } from './utils';

import { t, tEx, locale } from './i18n';
// Relatório de acompanhamento do aluno em PDF, para o personal mostrar o
// resultado (compartilhar pelo celular ou imprimir). Só traz o que é de
// treino e corpo: sem e-mail, lesões, restrições nem contato de emergência,
// porque o arquivo sai do app e pode ser encaminhado.

export const REPORT_LOADS = 10;
export const REPORT_WEIGHTS = 8;

const ACCENT = [249, 115, 22];
const INK = [24, 24, 27];
const MUTED = [113, 113, 122];
const LINE = [228, 228, 231];
const SOFT = [250, 250, 250];

const num = v => String(v).replace('.', ',');
const signed = v => `${v > 0 ? '+' : ''}${num(v)}`;

// Remove acentos que a fonte padrão do PDF não cobre e emojis; mantém o resto.
// (As fontes padrão do PDF cobrem Latin-1: ã, ç, é... passam sem problema.)
export function pdfText(value) {
  return String(value ?? '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[→➔]/g, '->')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nome do arquivo: relatorio-ana-paula-2026-10-15.pdf
export function reportFileName(name, today) {
  const slug = String(name || 'aluno')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'aluno';
  return `relatorio-${slug}-${today}.pdf`;
}

// Monta o que vai no PDF a partir dos dados que a ficha já carregou.
// `weeks`: weeklyCounts (8 semanas). `summary`: summarizeClient.
export function buildReportModel({ client, detail, summary, weeks, today, goal }) {
  const profile = detail?.profile || {};
  const weights = summary?.weights || [];
  const measures = MEASURE_FIELDS
    .filter(({ key }) => summary?.measureDeltas?.[key])
    .map(({ key, label }) => ({ label, ...summary.measureDeltas[key] }));
  const loads = (detail?.loads || []).slice(0, REPORT_LOADS).map(l => ({
    exercise: tEx(l.exercise), max: Number(l.max), sessions: Number(l.sessions) || 0,
  }));

  return {
    name: client?.name || profile.name || '',
    dateLabel: new Date(`${today}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }),
    today,
    info: [
      profile.idade && t('{n} anos', { n: profile.idade }),
      profile.peso && `${num(profile.peso)} kg`,
      profile.altura && `${profile.altura} cm`,
    ].filter(Boolean).join(' · '),
    kpis: [
      { label: t('treinos em 7 dias'), value: String(summary?.last7 ?? 0) },
      { label: t('treinos em 30 dias'), value: String(summary?.last30 ?? 0) },
      { label: t('dias de sequência'), value: summary?.streak ? String(summary.streak) : '-' },
      { label: t('último treino'), value: summary?.lastDay ? fmtDate(summary.lastDay) : '-' },
    ],
    goal: goal || null,
    weeks: (weeks || []).map(w => ({ label: fmtDate(w.end), count: w.count })),
    plan: detail?.plan ? { name: detail.plan.name, days: detail.plan.days } : null,
    weight: weights.length
      ? {
          first: weights[0].value,
          last: weights[weights.length - 1].value,
          delta: summary.weightDelta,
          points: weights.slice(-REPORT_WEIGHTS).map(w => ({ label: fmtDate(w.date), value: w.value })),
        }
      : null,
    measures,
    loads,
    checkins: summary?.checkins
      ? CHECKIN_FIELDS.map(({ key, label }) => ({ label, value: summary.checkins[key] }))
      : null,
  };
}

// ---- PDF -------------------------------------------------------------------
// jsPDF só é baixado quando o personal pede o relatório.
export async function renderReportPdf(model) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 15;
  const CW = W - 2 * M;
  let y = 0;

  const color = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c) => doc.setDrawColor(c[0], c[1], c[2]);
  const text = (s, x, yy, opts) => doc.text(pdfText(s), x, yy, opts);

  function ensure(h) {
    if (y + h <= 285) return;
    doc.addPage();
    y = M;
  }

  function heading(label) {
    ensure(26); // título + pelo menos a primeira linha, para o título não ficar sozinho no fim da página
    y += 4;
    fill(ACCENT);
    doc.rect(M, y - 4, 1.2, 5.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); color(INK);
    text(label, M + 3.5, y);
    y += 8;
  }

  function row(left, right, bold = false) {
    ensure(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); color(INK);
    text(left, M + 1, y);
    doc.setFont('helvetica', 'bold');
    text(right, W - M - 1, y, { align: 'right' });
    stroke(LINE); doc.setLineWidth(0.2); doc.line(M, y + 2, W - M, y + 2);
    y += 7;
  }

  // Cabeçalho
  fill(ACCENT);
  doc.rect(0, 0, W, 4, 'F');
  y = 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); color(INK);
  text(model.name || t('Aluno'), M, y);
  y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); color(MUTED);
  text(t('Relatório de acompanhamento · {d}', { d: model.dateLabel }), M, y);
  if (model.info) { y += 5; text(model.info, M, y); }
  y += 4;

  // Números do período
  const boxW = (CW - 3 * 3) / 4;
  model.kpis.forEach((k, i) => {
    const x = M + i * (boxW + 3);
    fill(SOFT); stroke(LINE); doc.setLineWidth(0.2);
    doc.roundedRect(x, y, boxW, 20, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); color(INK);
    text(k.value, x + boxW / 2, y + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); color(MUTED);
    text(k.label, x + boxW / 2, y + 16, { align: 'center', maxWidth: boxW - 3 });
  });
  y += 24;

  // Treinos por semana
  if (model.weeks.length) {
    heading(t('Treinos por semana'));
    const chartH = 32;
    const max = Math.max(model.goal || 0, ...model.weeks.map(w => w.count), 1);
    // com meta, reserva uma faixa à direita para o rótulo da linha (sem cobrir as barras)
    const chartW = model.goal ? CW - 18 : CW;
    const slot = chartW / model.weeks.length;
    const barW = Math.min(slot * 0.55, 14);
    const base = y + chartH;
    stroke(LINE); doc.setLineWidth(0.3); doc.line(M, base, M + chartW, base);
    if (model.goal) {
      const gy = base - (model.goal / max) * (chartH - 6);
      stroke(MUTED); doc.setLineDashPattern([1.2, 1.2], 0); doc.line(M, gy, M + chartW, gy); doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); color(MUTED);
      text(t('meta {n}/sem', { n: model.goal }), W - M, gy + 1, { align: 'right' });
    }
    model.weeks.forEach((w, i) => {
      const cx = M + slot * i + slot / 2;
      const h = (w.count / max) * (chartH - 6);
      fill(ACCENT);
      if (h > 0) doc.rect(cx - barW / 2, base - h, barW, h, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); color(INK);
      text(String(w.count), cx, base - h - 1.2, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); color(MUTED);
      text(w.label, cx, base + 4, { align: 'center' });
    });
    y = base + 8;
  }

  if (model.plan) {
    heading(t('Plano atual'));
    row(model.plan.name, t('{n} dia(s) por semana', { n: model.plan.days }));
  }

  if (model.weight) {
    heading(t('Peso'));
    row(t('Início do período'), `${num(model.weight.first)} kg`);
    row(t('Atual'), `${num(model.weight.last)} kg`);
    if (model.weight.delta !== null) row(t('Variação'), `${signed(model.weight.delta)} kg`, true);
    if (model.weight.points.length > 1) {
      ensure(10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(MUTED);
      text(model.weight.points.map(p => `${p.label}: ${num(p.value)}`).join('   '), M + 1, y + 1, { maxWidth: CW - 2 });
      y += 8;
    }
  }

  if (model.measures.length) {
    heading(t('Medidas corporais (cm)'));
    model.measures.forEach(m => row(m.label, `${num(m.first)} -> ${num(m.last)} (${signed(m.diff)})`));
  }

  if (model.loads.length) {
    heading(t('Cargas máximas (90 dias)'));
    model.loads.forEach(l => row(l.exercise, `${num(l.max)} kg · ${t('{n} treino(s)', { n: l.sessions })}`));
  }

  if (model.checkins) {
    heading(t('Como tem se sentido (30 dias)'));
    model.checkins.forEach(c => row(t('{label} · média', { label: c.label }), `${num(c.value)}/5`));
  }

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(MUTED);
    text(t('Gerado pelo EAFIT · {d}', { d: model.dateLabel }), M, 291);
    text(`${p}/${pages}`, W - M, 291, { align: 'right' });
  }

  return doc.output('blob');
}

// Compartilha o arquivo (celular) ou baixa (computador). Devolve
// 'shared' | 'downloaded' | 'cancelled'.
export async function shareOrDownloadPdf(blob, fileName, title) {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // sem permissão para compartilhar: cai no download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
