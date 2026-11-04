import { PLAN_WEEK } from './planTextParser';

// Ficha em tabela (planilha, CSV/TSV, PDF com colunas): acha o cabeçalho
// "Exercício" e lê dessa coluna em diante — Exercício, Séries, Reps, Descanso,
// Técnica/Observação. O que está à esquerda é ignorado, exceto uma coluna
// "Dia"/"Treino" (agrupa os exercícios em treinos). Linha com só um título
// ("Treino B - Costas", "Segunda") abre um treino novo.

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// Cabeçalhos aceitos pelo começo do texto (já sem acento e minúsculo), para
// pegar "Repetições ou duração", "Reps/Tempo", "Séries (nº)", "Observações"…
const HEADERS = {
  exercicio: /^(exercicios?|nome do exercicio|nome)\b/,
  series: /^(series?|sets?)\b/,
  reps: /^(reps?\b|repeticao|repeticoes|duracao|tempo)/,
  descanso: /^(descanso|intervalo|pausa|rest)/,
  tecnica: /^(tecnicas?|observac|obs\b|metodo|notas?\b)/,
  dia: /^(dia|treino|ficha|divisao)\b/,
};

// Texto CSV/TSV -> linhas de células. Delimitador (tab, ; ou ,) pela primeira
// linha; aspas duplas protegem o delimitador. null se não parece tabela.
export function parseDelimited(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  const sample = lines.find(l => l.trim()) || '';
  const delim = ['\t', ';', ','].map(d => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0];
  if (!delim || delim[1] < 2) return null;
  return lines.filter(l => l.trim()).map(line => {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim[0]) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const col = rows[r].findIndex(c => HEADERS.exercicio.test(norm(c)));
    if (col >= 0) return { r, col };
  }
  return null;
}

const weekday = v => PLAN_WEEK.find(d => norm(d) === norm(v).replace(/\s*-?\s*feira$/, ''));

function treinoFor(label, index) {
  const text = clean(label);
  const wd = weekday(text);
  if (wd) return { titulo: String.fromCharCode(65 + index), foco: '', dia: wd };
  const m = text.match(/^(?:dia|treino|ficha)?\s*([a-z]|\d{1,2})(?:\s*[:\-–—(]\s*(.*?)\)?)?$/i);
  if (m) return { titulo: m[1].toUpperCase(), foco: clean(m[2]), dia: null };
  return { titulo: String.fromCharCode(65 + index), foco: text, dia: null };
}

// -> { treinos } no mesmo formato de parseWorkoutPlanText, ou null.
export function parsePlanTable(rows) {
  if (!Array.isArray(rows)) return null;
  const head = findHeader(rows);
  if (!head) return null;
  const cols = {};
  rows[head.r].forEach((c, i) => {
    const h = norm(c);
    for (const key of ['series', 'reps', 'descanso', 'tecnica']) {
      if (i > head.col && cols[key] === undefined && HEADERS[key].test(h)) cols[key] = i;
    }
    if (i !== head.col && cols.dia === undefined && HEADERS.dia.test(h)) cols.dia = i;
  });

  const treinos = [];
  const byKey = new Map();
  let current = null;
  const open = label => {
    const key = norm(label) || `#${treinos.length}`;
    if (!byKey.has(key)) {
      const t = { ...treinoFor(label, treinos.length), exercicios: [] };
      byKey.set(key, t);
      treinos.push(t);
    }
    return byKey.get(key);
  };

  rows.slice(head.r + 1).forEach(row => {
    const nome = clean(row[head.col]);
    const filled = row.map(clean).filter(Boolean);
    if (!filled.length || HEADERS.exercicio.test(norm(nome))) return;
    const seriesRaw = clean(row[cols.series]);
    const repsRaw = clean(row[cols.reps]);
    const combined = seriesRaw.match(/^(\d{1,2})\s*[x×]\s*(.+)$/i);
    if (!(seriesRaw || repsRaw) || !nome) {
      // Linha de título: só um texto na linha inteira.
      if (filled.length === 1) current = open(filled[0]);
      return;
    }
    const series = combined ? combined[1] : (seriesRaw.match(/\d+/) || ['3'])[0];
    if (Number(series) < 1 || Number(series) > 10) return;
    const dayLabel = cols.dia !== undefined ? clean(row[cols.dia]) : '';
    const t = dayLabel ? open(dayLabel) : (current || (current = open('A')));
    t.exercicios.push({
      nome,
      series,
      reps: combined ? clean(combined[2]) : repsRaw,
      descanso: clean(row[cols.descanso]),
      tecnica: clean(row[cols.tecnica]),
    });
  });

  const filledTreinos = treinos.filter(t => t.exercicios.length);
  return filledTreinos.length ? { treinos: filledTreinos } : null;
}
