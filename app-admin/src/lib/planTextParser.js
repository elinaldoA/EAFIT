// Ficha de treino (Dia A/B/C com séries e repetições, sem datas) lida de PDF,
// foto, planilha ou texto vira um plano novo — não histórico: a ficha diz o
// que fazer, não o que foi feito. Usado pelo ImportWorkoutsModal quando o
// arquivo não tem datas.

// Ordem dos dias no plano (a mesma de data/treinoData.js).
export const PLAN_WEEK = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Dias da semana sugeridos para N treinos sem dia definido na ficha.
const SPREAD = {
  1: ['Segunda'],
  2: ['Segunda', 'Quinta'],
  3: ['Segunda', 'Quarta', 'Sexta'],
  4: ['Segunda', 'Terça', 'Quinta', 'Sexta'],
  5: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'],
  6: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  7: PLAN_WEEK,
};

const DEFAULT_SERIES = '3';
const MAX_DAY_EXERCISES = 20; // mesmo teto do editor do personal (lib/trainerPlan.js)
const WEEKDAY = /^(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:\s*-?\s*feira)?\b\s*[:\-–—(]?\s*(.*)$/i;
const DAY_HEADER = /^(?:dia|treino|ficha|day|workout)\s+([a-z]|\d{1,2})(?![a-z0-9])\s*[:\-–—(]?\s*(.*)$/i;
const REPS = '(\\d{1,3}(?:\\s*[-–—a]\\s*\\d{1,3})?)';
const SECS = /^(?:s|seg|segs|segundos?|sec|secs|seconds?)\b\.?\s*/i;

const canonWeekday = w => PLAN_WEEK.find(d => d.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  === w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*-?\s*feira$/, ''));

const cleanFoco = s => s.replace(/[():]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—]+|[\s\-–—]+$/g, '').trim();
const cleanName = s => s.replace(/^[\s\-–—•·*>.)|]+/, '').replace(/[\s\-–—:|,;(@]+$/, '').replace(/\s+/g, ' ').trim();
const cleanReps = r => r.replace(/\s*[-–—a]\s*/g, '-');

// Uma linha de exercício da ficha: "Supino reto 4x10", "Supino 4 x 8-10",
// "Rosca 3 séries de 12", ou coluna de tabela "Supino reto com barra 4 8-10".
// -> { nome, series, reps, descanso, tecnica } ou null.
export function parsePlanLine(line) {
  const s = String(line || '').replace(/[×✕]/g, 'x').trim();
  let m = s.match(new RegExp(`^(.*?[a-zà-ú)])\\s*(\\d{1,2})\\s*(?:x|s[eé]ries?\\s*(?:de|x)?|sets?\\s*(?:of|x)?)\\s*${REPS}\\s*(.*)$`, 'i'))
    // Tabela: nome, séries e reps em colunas; a série às vezes sai ilegível no OCR ("a", "E)").
    || s.match(new RegExp(`^(.*[a-zà-ú)])\\s+(\\d{1,2})\\s+${REPS}\\s*(.*)$`, 'i'))
    || s.match(new RegExp(`^(.*?[a-zà-ú])\\s+([^\\s\\d]{1,2})\\s+${REPS}\\s*(.*)$`, 'i'));
  if (!m) return null;
  const nome = cleanName(m[1]);
  // Frase de texto corrido ("Você vai aprender as 17 técnicas") não é exercício.
  if ((nome.match(/[a-zà-ú]/gi) || []).length < 3 || nome.includes(':') || nome.split(' ').length > 8) return null;
  const seriesNum = /^\d+$/.test(m[2]) ? Number(m[2]) : null;
  if (seriesNum !== null && (seriesNum < 1 || seriesNum > 10)) return null;
  let reps = cleanReps(m[3]);
  let rest = m[4] || '';
  if (SECS.test(rest)) { reps = `${reps}s`; rest = rest.replace(SECS, ''); }
  const tecnica = cleanName(rest.replace(/\b\d+\s*kg\b/i, ''));
  return {
    nome,
    series: seriesNum !== null ? String(seriesNum) : DEFAULT_SERIES,
    reps,
    descanso: '',
    tecnica: tecnica ? tecnica[0].toUpperCase() + tecnica.slice(1) : '',
  };
}

// Texto da ficha -> { treinos: [{ titulo, foco, dia, exercicios }] } ou null
// quando não parece uma ficha (menos de 2 exercícios reconhecidos).
// dia: dia da semana escrito na ficha, ou null.
export function parseWorkoutPlanText(text) {
  const lines = String(text || '').split(/\r?\n/)
    .map(l => l.replace(/\t+/g, '  ').trim().replace(/^\d{1,2}\s*[.,)\-–]\s*(?=\D)/, ''))
    .filter(Boolean);
  const treinos = [];
  let current = null;
  const open = (titulo, foco, dia) => { current = { titulo, foco, dia, exercicios: [] }; treinos.push(current); };

  lines.forEach(line => {
    let m;
    if ((m = line.match(WEEKDAY)) && !parsePlanLine(line)) {
      open(String.fromCharCode(65 + treinos.length), cleanFoco(m[2]), canonWeekday(m[1]));
      return;
    }
    if ((m = line.match(DAY_HEADER))) {
      open(m[1].toUpperCase(), cleanFoco(m[2]), null);
      return;
    }
    const ex = parsePlanLine(line);
    if (!ex) return;
    if (!current) open('A', '', null);
    current.exercicios.push(ex);
  });

  const filled = treinos.filter(t => t.exercicios.length);
  if (filled.reduce((n, t) => n + t.exercicios.length, 0) < 2) return null;
  return { treinos: filled };
}

// Monta os 7 dias do plano: cada treino no dia escrito na ficha ou, se não
// houver, distribuído na semana (A seg, B qua, C sex…); os outros dias ficam
// de descanso. -> [{ dia, foco, exercicios, pos }]
export function planDaysFromTreinos(treinos, restLabel) {
  const taken = new Set(treinos.map(t => t.dia).filter(Boolean));
  const free = (SPREAD[Math.min(treinos.length, 7)] || PLAN_WEEK).filter(d => !taken.has(d));
  const spare = PLAN_WEEK.filter(d => !taken.has(d) && !free.includes(d));
  const byDay = new Map();
  treinos.slice(0, 7).forEach(t => {
    const dia = t.dia && !byDay.has(t.dia) ? t.dia : (free.shift() || spare.shift());
    byDay.set(dia, t);
  });
  return PLAN_WEEK.map(dia => {
    const t = byDay.get(dia);
    if (!t) return { dia, foco: restLabel, exercicios: [], pos: [] };
    const foco = /^[A-Z]$|^\d+$/.test(t.titulo) ? `Treino ${t.titulo}${t.foco ? ` — ${t.foco}` : ''}` : t.foco;
    return { dia, foco, exercicios: t.exercicios.slice(0, MAX_DAY_EXERCISES), pos: [] };
  });
}
