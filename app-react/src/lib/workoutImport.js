import { db } from './supabase';
import { DAY_NAMES } from '../data/treinoData';
import { parseLocalDate, toDateStr } from './utils';

// Importação de treinos feitos fora do app: CSV exportado pelo Strong ou pelo
// Hevy (também aceita CSV/TSV/planilha/JSON próprio com as mesmas colunas) e
// texto livre lido de PDF ou foto ("Supino 4x10 40kg"). Tudo vira linhas de
// workouts + exercise_sets, as mesmas que o treino ao vivo grava — então
// histórico, recordes e evolução já passam a contar o treino importado.
// A leitura dos arquivos (PDF, OCR, xlsx) fica em lib/workoutImportFiles.js.

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_TIMED_SECONDS = 3600; // limite da coluna duracao_s (migration timed_sets)

// CSV com aspas ("a,b" e "" dentro de campo) e quebras de linha dentro de aspas.
// O separador (vírgula, ponto e vírgula ou tab) é o que mais aparece na 1ª linha.
export function parseCSV(text, forceDelim) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const count = ch => firstLine.split(ch).length - 1;
  const delim = forceDelim || [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best));
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Nome de coluna (normalizado) -> campo interno. Strong, Hevy e PT-BR.
const COLUMNS = {
  date: ['date', 'start time', 'data', 'inicio'],
  workout: ['workout name', 'title', 'treino', 'nome do treino'],
  duration: ['duration', 'duracao'],
  exercise: ['exercise name', 'exercise title', 'exercise', 'exercicio', 'nome do exercicio'],
  weight: ['weight', 'weight kg', 'carga', 'carga kg', 'peso'],
  reps: ['reps', 'repeticoes'],
  distance: ['distance', 'distance km', 'distancia', 'distancia km'],
  seconds: ['seconds', 'duration seconds', 'segundos', 'tempo s'],
  setType: ['set type'],
};

function mapHeader(header) {
  const names = header.map(norm);
  const idx = {};
  Object.entries(COLUMNS).forEach(([key, aliases]) => {
    const i = names.findIndex(n => aliases.includes(n));
    if (i >= 0) idx[key] = i;
  });
  return idx;
}

const MONTHS = { jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12 };

// "2024-01-15 10:30:00", "15/01/2024 10:30", "15 Jan 2024, 10:30" -> "2024-01-15".
// Número de 5 dígitos é data serial do Excel (dias desde 30/12/1899).
export function parseImportDate(raw) {
  const s = String(raw || '').trim();
  let y, m, d;
  let r;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [, y, m, d] = r;
  else if ((r = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) [, d, m, y] = r;
  else if ((r = s.match(/^(\d{1,2})\s+([A-Za-zçÇ]{3})[A-Za-zçÇ]*\.?,?\s+(\d{4})/))) {
    d = r[1]; y = r[3]; m = MONTHS[r[2].toLowerCase()];
  } else return null;
  y = Number(y); m = Number(m); d = Number(d);
  const dt = new Date(y, m - 1, d, 12);
  if (!m || dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return toDateStr(dt);
}

// "1h 5m", "45m", "1:05:00", "3900" -> segundos.
export function parseImportDuration(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/))) {
    return m[3] === undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const h = s.match(/(\d+)\s*h/);
  const min = s.match(/(\d+)\s*m/);
  const sec = s.match(/(\d+)\s*s/);
  if (!h && !min && !sec) return null;
  return (h ? Number(h[1]) * 3600 : 0) + (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0);
}

function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Junta sessões por dia (dois treinos no mesmo dia viram um só: o app guarda
// um treino por dia) e classifica cada série como força, isométrico ou cardio.
function sessionBuilder() {
  const byDate = new Map();
  return {
    session(date) {
      let s = byDate.get(date);
      if (!s) {
        s = { date, dayOfWeek: DAY_NAMES[parseLocalDate(date).getDay()], durationSeconds: 0, notes: '', exercises: [], byName: new Map() };
        byDate.set(date, s);
      }
      return s;
    },
    addTitle(s, title) {
      if (title && !s.notes.includes(title)) s.notes = s.notes ? `${s.notes} + ${title}` : title;
    },
    exercise(s, nome) {
      let ex = s.byName.get(nome);
      if (!ex) { ex = { nome, sets: [] }; s.byName.set(nome, ex); s.exercises.push(ex); }
      return ex;
    },
    // false quando a série não tem valor nenhum.
    addSet(ex, { weight, reps, distance, seconds }) {
      // O Strong exporta 0 nos campos que não se aplicam: zero conta como vazio.
      const w = weight || null;
      const r = reps || null;
      const dist = distance || null;
      const sec = seconds || null;
      if (w === null && r === null && dist === null && sec === null) return false;
      const set = { n: ex.sets.length + 1, carga: null, reps: null, duracaoMin: null, distanciaKm: null, duracaoS: null };
      if (r === null && w === null && dist !== null) {
        set.distanciaKm = Math.round(dist * 100) / 100;
        if (sec) set.duracaoMin = Math.round((sec / 60) * 10) / 10;
      } else if (r === null && sec !== null) {
        set.duracaoS = Math.min(sec, MAX_TIMED_SECONDS);
        set.carga = w;
      } else {
        set.carga = w;
        set.reps = r;
      }
      ex.sets.push(set);
      return true;
    },
    finish(skipped) {
      const sessions = [...byDate.values()]
        .map(({ byName: _byName, ...s }) => ({ ...s, exercises: s.exercises.filter(e => e.sets.length) }))
        .filter(s => s.exercises.length)
        .sort((a, b) => b.date.localeCompare(a.date));
      return { sessions, skipped, error: sessions.length ? null : 'none' };
    },
  };
}

// Linhas de tabela (CSV, TSV, planilha, JSON) -> sessões por dia.
// -> { sessions: [{ date, dayOfWeek, durationSeconds, notes, exercises: [{ nome, sets }] }], skipped, error }
export function parseWorkoutRows(rows) {
  if (rows.length < 2) return { sessions: [], skipped: 0, error: 'empty' };
  const col = mapHeader(rows[0]);
  if (col.date === undefined || col.exercise === undefined) return { sessions: [], skipped: 0, error: 'columns' };
  const get = (row, key) => (col[key] === undefined ? '' : String(row[col[key]] ?? '').trim());

  const b = sessionBuilder();
  let skipped = 0;
  // Um treino = data + nome: a duração dele entra uma única vez.
  const seenWorkouts = new Set();

  rows.slice(1).forEach(row => {
    const date = parseImportDate(get(row, 'date'));
    const nome = get(row, 'exercise');
    if (!date || !nome || get(row, 'setType').toLowerCase() === 'warmup') { skipped++; return; }

    const s = b.session(date);
    const wKey = `${get(row, 'date')}|${get(row, 'workout')}`;
    if (!seenWorkouts.has(wKey)) {
      seenWorkouts.add(wKey);
      s.durationSeconds += parseImportDuration(get(row, 'duration')) || 0;
      b.addTitle(s, get(row, 'workout'));
    }

    const ok = b.addSet(b.exercise(s, nome), {
      weight: num(get(row, 'weight')),
      reps: num(get(row, 'reps')),
      distance: num(get(row, 'distance')),
      seconds: num(get(row, 'seconds')),
    });
    if (!ok) skipped++;
  });

  return b.finish(skipped);
}

export function parseWorkoutCSV(text) {
  return parseWorkoutRows(parseCSV(text));
}

// JSON de outros apps: lista de linhas com as colunas do CSV, ou lista de
// treinos com exercícios e séries aninhados (Hevy e parecidos). Vira tabela.
export function workoutJSONToRows(text) {
  const data = JSON.parse(String(text || '').replace(/^﻿/, ''));
  const pick = (o, keys) => {
    for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    return '';
  };
  // Epoch em ms ou em segundos -> ISO.
  const asDate = v => (typeof v === 'number' ? new Date(v > 1e11 ? v : v * 1000).toISOString() : v);
  const list = Array.isArray(data) ? data
    : [data?.workouts, data?.treinos, data?.sessions, data?.history, data?.data].find(Array.isArray) || [];
  if (!list.length) return [];

  const nested = list.some(w => Array.isArray(w?.exercises) || Array.isArray(w?.exercicios));
  if (!nested) {
    const keys = [...new Set(list.flatMap(o => (o && typeof o === 'object' ? Object.keys(o) : [])))];
    return [keys, ...list.map(o => keys.map(k => String(o?.[k] ?? '')))];
  }

  const rows = [['date', 'workout name', 'duration', 'exercise name', 'weight', 'reps', 'distance', 'seconds', 'set type']];
  list.forEach(w => {
    const start = asDate(pick(w, ['start_time', 'startTime', 'date', 'data', 'inicio']));
    const end = asDate(pick(w, ['end_time', 'endTime']));
    let duration = pick(w, ['duration_seconds', 'duration', 'duracao']);
    if (!duration && start && end) {
      const secs = (Date.parse(end) - Date.parse(start)) / 1000;
      if (secs > 0) duration = Math.round(secs);
    }
    const title = pick(w, ['title', 'name', 'nome', 'workout_name']);
    (w.exercises || w.exercicios || []).forEach(ex => {
      const nome = pick(ex, ['title', 'name', 'nome', 'exercise_title', 'exercise_name']) || pick(ex.exercise, ['name', 'title']);
      (ex.sets || ex.series || []).forEach(set => {
        rows.push([start, title, duration, nome,
          pick(set, ['weight_kg', 'weight', 'carga', 'peso']),
          pick(set, ['reps', 'repeticoes']),
          pick(set, ['distance_km', 'distance', 'distancia']),
          pick(set, ['duration_seconds', 'seconds', 'segundos']),
          pick(set, ['type', 'set_type'])].map(v => String(v)));
      });
    });
  });
  return rows;
}

const MONTH_WORDS = 'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|june|july|august|september|october|november|december|jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec';
const DATE_IN_TEXT = new RegExp(
  `(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}|\\d{1,2}\\s+(?:de\\s+)?(?:${MONTH_WORDS})\\.?,?\\s+(?:de\\s+)?\\d{4})`, 'i');

// Acha uma data em qualquer ponto da linha ("Treino A — 15/01/24", "15 de janeiro de 2024").
// -> { date, rest } (rest = a linha sem a data) ou null.
export function findDateInText(line) {
  const m = String(line || '').match(DATE_IN_TEXT);
  if (!m) return null;
  let raw = m[1].replace(/\s+de\s+/gi, ' ').replace(/março/i, 'mar');
  const short = raw.match(/^(\d{1,2}[/.]\d{1,2}[/.])(\d{2})$/);
  if (short) raw = `${short[1]}20${short[2]}`;
  const date = parseImportDate(raw);
  return date ? { date, rest: String(line).replace(m[0], ' ') } : null;
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
// "kq"/"k9": jeitos comuns do OCR ler "kg".
const KG = '\\s*(kgs?|kq|k9|quilos?|lbs?|libras?)(?![a-z])';
const SECS = '\\s*(?:s|seg|segs|segundos?|sec|secs|seconds?)(?![a-z])';
const dec = v => parseFloat(String(v).replace(',', '.'));
const toKg = (v, unit) => (/^l/i.test(unit) ? Math.round(v * 0.4536 * 10) / 10 : v);
const repeat = (times, set) => Array.from({ length: times }, () => ({ ...set }));

// Séries escritas numa linha de texto: "4x10 40kg", "3 séries de 12",
// "40kg x 10, 45kg x 8", "12 reps", "3x30s", "30 min 5 km".
// -> [{ weight, reps, distance, seconds }]
export function parseSetsInText(line) {
  const s = ` ${String(line || '').toLowerCase().replace(/[×✕*]/g, 'x')} `;
  let m;

  // Carga x reps, uma série por par: "40kg x 10 / 45kg x 8".
  const pairs = [...s.matchAll(new RegExp(`${NUM}${KG}\\s*x\\s*(\\d+)`, 'g'))];
  if (pairs.length) return pairs.map(p => ({ weight: toKg(dec(p[1]), p[2]), reps: Number(p[3]), distance: null, seconds: null }));

  const kg = s.match(new RegExp(`${NUM}${KG}`));
  const weight = kg ? toKg(dec(kg[1]), kg[2]) : null;

  // Séries x tempo: "3x30s", "3 x 45 seg".
  if ((m = s.match(new RegExp(`(\\d+)\\s*x\\s*(\\d+)${SECS}`))) && Number(m[1]) <= 20) {
    return repeat(Number(m[1]), { weight, reps: null, distance: null, seconds: Number(m[2]) });
  }
  // Séries x reps: "4x10", "4 x 10-12", "3 séries de 12", "3 sets of 10".
  if ((m = s.match(/(\d+)\s*(?:x|s[eé]ries?\s*(?:de|x)?|sets?\s*(?:of|x)?)\s*(\d+)/)) && Number(m[1]) >= 1 && Number(m[1]) <= 20) {
    return repeat(Number(m[1]), { weight, reps: Number(m[2]), distance: null, seconds: null });
  }
  // Uma série: "12 reps", "12 repetições".
  if ((m = s.match(/(\d+)\s*(?:reps?|repeti[cç](?:[oõ]es|ao|ão))(?![a-z])/))) return [{ weight, reps: Number(m[1]), distance: null, seconds: null }];
  // Cardio ou isométrico: "30 min 5 km", "5 km", "45s", "20 min".
  const km = s.match(new RegExp(`${NUM}\\s*km(?![a-z])`));
  const min = s.match(new RegExp(`${NUM}\\s*(?:min|mins|minutos?)(?![a-z])`));
  const sec = s.match(new RegExp(`(\\d+)${SECS}`));
  const seconds = min ? Math.round(dec(min[1]) * 60) : sec ? Number(sec[1]) : null;
  if (km || seconds) return [{ weight, reps: null, distance: km ? dec(km[1]) : null, seconds }];
  return [];
}

// Nome do exercício: o texto antes do primeiro número, sem marcadores de lista.
function exerciseName(line) {
  return String(line || '').split(/\d/)[0]
    .replace(/^[\s\-–—•·*>.)]+/, '').replace(/[\s\-–—:|,;(@]+$/, '').replace(/\s+/g, ' ').trim();
}

const SET_LABEL = /^\s*(?:s[eé]rie|serie|set)\s*\d*\s*[:.\-–)]?/i;

// Texto livre (PDF, foto, .txt): cada data abre um treino, cada linha com nome
// e séries vira um exercício, uma linha só com nome vale para as séries das
// linhas seguintes, e linhas só com séries ("Série 2: 40kg x 8") entram no
// último exercício. Sem data nenhuma no texto, tudo vai para fallbackDate (o
// modal pede o dia ao usuário).
// -> mesmo retorno de parseWorkoutRows, mais undated: true quando não achou data.
export function parseWorkoutText(text, fallbackDate) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/)
    // Tabs viram espaço e a numeração de lista ("1. Supino", "2) Remada") sai.
    .map(l => l.replace(/\t+/g, '  ').trim().replace(/^\d{1,2}\s*[.)\-–]\s+(?=\D)/, ''))
    .filter(Boolean);
  if (!lines.length) return { sessions: [], skipped: 0, error: 'empty' };
  const undated = !lines.some(l => findDateInText(l));
  const b = sessionBuilder();
  let skipped = 0;
  let current = undated && fallbackDate ? b.session(fallbackDate) : null;
  let lastEx = null;
  let pendingName = '';

  lines.forEach(line => {
    const found = findDateInText(line);
    if (found) {
      current = b.session(found.date);
      lastEx = null;
      pendingName = '';
      // "15/01 Supino 4x10 40kg": a data abre o treino e o resto é exercício.
      if (!parseSetsInText(found.rest).length) {
        b.addTitle(current, exerciseName(found.rest.replace(/\d+/g, '')));
        return;
      }
      line = found.rest.trim();
    }
    const sets = parseSetsInText(line);
    if (!sets.length) {
      pendingName = /\d/.test(line) ? '' : exerciseName(line);
      return;
    }
    if (!current) { skipped++; return; }
    let nome = SET_LABEL.test(line) ? '' : exerciseName(line);
    if (!nome && pendingName) { nome = pendingName; pendingName = ''; }
    const ex = nome ? b.exercise(current, nome) : lastEx;
    if (!ex) { skipped++; return; }
    lastEx = ex;
    sets.forEach(set => { if (!b.addSet(ex, set)) skipped++; });
  });

  return { ...b.finish(skipped), undated };
}

const isHeader = row => { const c = mapHeader(row); return c.date !== undefined && c.exercise !== undefined; };

// Tabela a partir do cabeçalho, que pode vir depois de linhas de título
// (planilha feita à mão, tabela de PDF). null se não houver cabeçalho.
function rowsFromHeader(rows) {
  const i = rows.slice(0, 30).findIndex(isHeader);
  return i < 0 ? null : rows.slice(i);
}

// Entrada única do modal. source: { rows } (planilha, JSON) ou { text }.
// Tabela quando acha as colunas de data e exercício; senão o conteúdo é lido
// como texto livre.
export function parseImportSource(source, fallbackDate) {
  if (source.rows) {
    const table = rowsFromHeader(source.rows);
    if (table) return parseWorkoutRows(table);
    if (source.rows.length < 1) return { sessions: [], skipped: 0, error: 'empty' };
    return parseWorkoutText(source.rows.map(r => r.join('  ')).join('\n'), fallbackDate);
  }
  for (const delim of [undefined, ',', ';', '\t']) {
    const table = rowsFromHeader(parseCSV(source.text, delim));
    if (table) return parseWorkoutRows(table);
  }
  return parseWorkoutText(source.text, fallbackDate);
}

export function summarizeImport(sessions) {
  return sessions.reduce((acc, s) => ({
    treinos: acc.treinos + 1,
    exercicios: acc.exercicios + s.exercises.length,
    series: acc.series + s.exercises.reduce((n, e) => n + e.sets.length, 0),
  }), { treinos: 0, exercicios: 0, series: 0 });
}

// Grava as sessões. Dias que já têm séries registradas no app ficam de fora
// (nunca sobrescreve treino feito aqui); datas futuras também.
// -> { imported, skippedExisting, skippedFuture }
export async function saveImportedSessions(userId, sessions) {
  const today = toDateStr(new Date());
  const usable = sessions.filter(s => s.date <= today);
  const skippedFuture = sessions.length - usable.length;
  if (!usable.length) return { imported: 0, skippedExisting: 0, skippedFuture };

  const { data: existing, error: eErr } = await db
    .from('workouts').select('id, workout_date').eq('user_id', userId).in('workout_date', usable.map(s => s.date));
  if (eErr) throw eErr;
  const idByDate = new Map((existing || []).map(w => [w.workout_date, w.id]));

  const withSets = new Set();
  if (idByDate.size) {
    const { data: sets, error: sErr } = await db
      .from('exercise_sets').select('workout_id').in('workout_id', [...idByDate.values()]);
    if (sErr) throw sErr;
    (sets || []).forEach(r => withSets.add(r.workout_id));
  }

  let imported = 0;
  let skippedExisting = 0;
  for (const s of usable) {
    const existingId = idByDate.get(s.date);
    if (existingId && withSets.has(existingId)) { skippedExisting++; continue; }

    const fields = {
      completed: true,
      notes: s.notes ? `📥 ${s.notes}` : '📥',
      duration_seconds: s.durationSeconds || null,
    };
    let wId = existingId;
    if (wId) {
      const { error } = await db.from('workouts').update(fields).eq('id', wId);
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from('workouts')
        .insert({ user_id: userId, workout_date: s.date, day_of_week: s.dayOfWeek, ...fields })
        .select('id').single();
      if (error) throw error;
      wId = data.id;
    }

    const rows = s.exercises.flatMap(e => e.sets.map(set => ({
      workout_id: wId, exercise_name: e.nome, set_number: set.n, completed: true,
      carga: set.carga, reps: set.reps, duracao_min: set.duracaoMin, distancia_km: set.distanciaKm, duracao_s: set.duracaoS,
    })));
    const { error: insErr } = await db.from('exercise_sets').upsert(rows, { onConflict: 'workout_id,exercise_name,set_number' });
    if (insErr) throw insErr;
    imported++;
  }
  return { imported, skippedExisting, skippedFuture };
}
