import { db } from './supabase';
import { todayDate } from '../data/treinoData';
import { addDays } from './pause';
import { fetchLibrary } from './exerciseSwap';

// Volume semanal por grupo muscular: quantas séries concluídas cada músculo
// recebeu nos últimos 7 dias. Conta só o músculo principal do exercício (o
// grupo_muscular da biblioteca; para exercício fora dela — criado pelo
// personal ou pela pessoa — o nome decide pelas palavras-chave abaixo).
// Músculos = as chaves do BodyAvatar (data/bodyMuscleMap.js).

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];

// Faixa semanal de referência para hipertrofia: abaixo de 10 séries o músculo
// costuma ficar para trás; acima de 20 o ganho extra é pequeno e a
// recuperação pesa.
export const WEEKLY_MIN = 10;
export const WEEKLY_MAX = 20;
const BEHIND_BELOW = 5;

const LIBRARY_GROUPS = {
  peito: 'chest', costas: 'back', ombro: 'shoulders', biceps: 'biceps', triceps: 'triceps',
  quadriceps: 'quads', posterior_coxa: 'hamstrings', gluteos: 'glutes', panturrilha: 'calves', core: 'abs',
};

// A ordem importa: o primeiro que casa decide ("Crucifixo Invertido" é ombro,
// não peito; "Elevação Pélvica" é glúteo, não ombro).
const KEYWORDS = [
  ['calves', /panturrilha|g[eê]meos|s[oó]leo/i],
  ['abs', /abdominal|prancha|crunch|abd[oô]men|eleva[cç][aã]o de pernas|russian|tesoura|ab wheel|\broda\b|bicicleta no solo|canivete|hollow|dead bug/i],
  ['glutes', /gl[uú]teo|eleva[cç][aã]o p[eé]lvica|hip thrust|abdu[cç][aã]o|\bponte\b/i],
  ['hamstrings', /flexora|stiff|romeno|good morning|posterior|n[oó]rdico/i],
  ['shoulders', /desenvolvimento|eleva[cç][aã]o (lateral|frontal)|crucifixo inver|face pull|arnold|remada alta|\bombro/i],
  ['triceps', /tr[ií]ceps|mergulho|paralela|\bfundos?\b|coice/i],
  ['biceps', /rosca|b[ií]ceps|scott|martelo/i],
  ['back', /remada|puxada|pulldown|pull down|barra fixa|pullover|serrote|levantamento terra|\bterra\b|dorsal|costas|graviton/i],
  ['quads', /agachamento|leg press|extensora|afundo|passada|hack|b[uú]lgaro|avan[cç]o|\bstep\b|quadr[ií]ceps|sissy/i],
  ['chest', /supino|crucifixo|peck|voador|flex[aã]o de bra[cç]o|crossover|peitoral|chest/i],
];

// Emoji do pós-treino ("🔷 Prancha") não faz parte do nome na biblioteca.
function cleanName(nome) {
  return String(nome || '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();
}

export function muscleOfName(nome, libraryMap = null) {
  const clean = cleanName(nome);
  const fromLib = libraryMap?.get(clean.toLowerCase());
  if (fromLib !== undefined) return fromLib;
  const hit = KEYWORDS.find(([, re]) => re.test(clean));
  return hit ? hit[0] : null;
}

// nome (minúsculo) → músculo ou null (mobilidade, antebraço, cardio).
export function buildLibraryMap(rows) {
  return new Map((rows || []).map(r => [String(r.nome).toLowerCase(), LIBRARY_GROUPS[r.grupo_muscular] ?? null]));
}

export async function fetchLibraryMap() {
  try {
    return buildLibraryMap(await fetchLibrary());
  } catch (err) {
    console.warn('fetchLibraryMap: sem biblioteca, só palavras-chave', err);
    return new Map();
  }
}

// sets: [{ exercise_name }] (uma linha por série concluída) → { músculo: séries }
export function countSetsByMuscle(sets, libraryMap = null) {
  const out = Object.fromEntries(MUSCLES.map(m => [m, 0]));
  (sets || []).forEach(s => {
    const m = muscleOfName(s.exercise_name, libraryMap);
    if (m) out[m] += 1;
  });
  return out;
}

export function volumeLevel(count) {
  if (!count) return 'none';
  if (count < WEEKLY_MIN) return 'low';
  return count > WEEKLY_MAX ? 'high' : 'ok';
}

// Músculos que o plano treina mas que receberam pouco na semana, do mais
// atrasado para o menos. planned: Set de músculos do plano ativo.
export function behindMuscles(counts, planned) {
  return MUSCLES
    .filter(m => planned.has(m) && counts[m] < BEHIND_BELOW)
    .sort((a, b) => counts[a] - counts[b]);
}

// Músculos do plano ativo (exercícios de força e pós-treino de todos os dias).
export function plannedMuscles(days, libraryMap = null) {
  const out = new Set();
  (days || []).forEach(d => [...d.exercicios, ...d.pos].forEach(ex => {
    if (!(parseInt(ex.series, 10) > 0)) return;
    const m = muscleOfName(ex.nome, libraryMap);
    if (m) out.add(m);
  }));
  return out;
}

// Séries concluídas dos últimos 7 dias (hoje incluído), com ou sem carga —
// abdominal e prancha também contam.
export async function fetchWeekSets(userId, today = todayDate()) {
  const since = addDays(today, -6);
  const { data, error } = await db
    .from('exercise_sets')
    .select('exercise_name, workouts!inner(user_id, workout_date)')
    .eq('workouts.user_id', userId)
    .gte('workouts.workout_date', since)
    .lte('workouts.workout_date', today)
    .eq('completed', true);
  if (error) throw error;
  return data || [];
}

// Músculos de um dia do plano, pelos exercícios (para a mobilidade do dia).
export function dayMuscles(day) {
  return plannedMuscles(day ? [day] : []);
}
