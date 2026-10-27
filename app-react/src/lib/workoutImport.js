import { db } from './supabase';
import { DAY_NAMES } from '../data/treinoData';
import { parseLocalDate, toDateStr } from './utils';

// Importação de treinos feitos fora do app: CSV exportado pelo Strong ou pelo
// Hevy (também aceita um CSV próprio com as mesmas colunas). Tudo vira linhas
// de workouts + exercise_sets, as mesmas que o treino ao vivo grava — então
// histórico, recordes e evolução já passam a contar o treino importado.

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_TIMED_SECONDS = 3600; // limite da coluna duracao_s (migration timed_sets)

// CSV com aspas ("a,b" e "" dentro de campo) e quebras de linha dentro de aspas.
export function parseCSV(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
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
  exercise: ['exercise name', 'exercise title', 'exercicio', 'nome do exercicio'],
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
export function parseImportDate(raw) {
  const s = String(raw || '').trim();
  let y, m, d;
  let r;
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

// Converte o texto do CSV em sessões por dia (dois treinos no mesmo dia viram
// um só: o app guarda um treino por dia).
// -> { sessions: [{ date, dayOfWeek, durationSeconds, notes, exercises: [{ nome, sets }] }], skipped, error }
export function parseWorkoutCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { sessions: [], skipped: 0, error: 'empty' };
  const col = mapHeader(rows[0]);
  if (col.date === undefined || col.exercise === undefined) return { sessions: [], skipped: 0, error: 'columns' };
  const get = (row, key) => (col[key] === undefined ? '' : (row[col[key]] ?? '').trim());

  const byDate = new Map();
  let skipped = 0;
  // Um treino = data + nome: a duração dele entra uma única vez.
  const seenWorkouts = new Set();

  rows.slice(1).forEach(row => {
    const date = parseImportDate(get(row, 'date'));
    const nome = get(row, 'exercise');
    if (!date || !nome || get(row, 'setType').toLowerCase() === 'warmup') { skipped++; return; }

    let s = byDate.get(date);
    if (!s) {
      s = { date, dayOfWeek: DAY_NAMES[parseLocalDate(date).getDay()], durationSeconds: 0, notes: '', exercises: [], byName: new Map() };
      byDate.set(date, s);
    }
    const wKey = `${get(row, 'date')}|${get(row, 'workout')}`;
    if (!seenWorkouts.has(wKey)) {
      seenWorkouts.add(wKey);
      s.durationSeconds += parseImportDuration(get(row, 'duration')) || 0;
      const title = get(row, 'workout');
      if (title && !s.notes.includes(title)) s.notes = s.notes ? `${s.notes} + ${title}` : title;
    }

    let ex = s.byName.get(nome);
    if (!ex) { ex = { nome, sets: [] }; s.byName.set(nome, ex); s.exercises.push(ex); }

    const weight = num(get(row, 'weight'));
    const reps = num(get(row, 'reps'));
    const distance = num(get(row, 'distance'));
    const seconds = num(get(row, 'seconds'));
    // O Strong exporta 0 nos campos que não se aplicam: zero conta como vazio.
    const w = weight || null;
    const r = reps || null;
    const dist = distance || null;
    const sec = seconds || null;
    if (w === null && r === null && dist === null && sec === null) { skipped++; return; }

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
  });

  const sessions = [...byDate.values()]
    .map(({ byName: _byName, ...s }) => ({ ...s, exercises: s.exercises.filter(e => e.sets.length) }))
    .filter(s => s.exercises.length)
    .sort((a, b) => b.date.localeCompare(a.date));
  return { sessions, skipped, error: sessions.length ? null : 'none' };
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
