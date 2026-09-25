import { db } from '../lib/supabase';

// Isso é espelhado (copiado à mão) em supabase/functions/_shared/exerciseLibrary.ts,
// usado por admin-generate-plan — a Edge Function roda em Deno e não
// compartilha build com o app (ver "Convenções" no README). Se mudar
// FOCO_TO_GRUPOS, allowedNiveis, pickExercisesForFoco ou as constantes abaixo,
// replique a mudança lá também.

// Mapeia o `foco` (texto exibido no dia do treino) pros grupos musculares de
// public.exercise_library — só cobre os focos de dia de treino de força dos
// 6 templates (workoutTemplates.js); dias de "Cardio Leve / Recuperação",
// "Descanso Total" e os dias de corrida do objetivo `resistencia` ficam de
// fora de propósito (não fazem sentido sorteados de uma lista de exercícios
// de força) e continuam vindo do template estático. A ordem dos grupos importa:
// o primeiro é o principal do dia e recebe o primeiro composto.
export const FOCO_TO_GRUPOS = {
  'Peito / Ombro / Tríceps': ['peito', 'ombro', 'triceps'],
  'Peito / Tríceps': ['peito', 'triceps'],
  'Costas / Bíceps': ['costas', 'biceps'],
  'Pernas / Quadríceps': ['quadriceps'],
  'Superiores / Força': ['peito', 'costas', 'ombro', 'biceps', 'triceps'],
  'Ombro / Força': ['ombro'],
  'Posterior / Glúteos': ['posterior_coxa', 'gluteos'],
  'Superiores': ['peito', 'costas', 'ombro', 'biceps', 'triceps'],
  'Força / Estabilidade': ['quadriceps', 'posterior_coxa', 'gluteos'],
};

const TARGET_COUNT = 5;
const COMPOSTO_COUNT = 2;
// Abaixo disso o pool de candidatos é raso demais pra valer a pena sortear
// (ex.: rede lenta trouxe só 1-2 linhas) — melhor manter o template estático
// do que gerar um dia repetitivo.
const MIN_POOL_SIZE = 3;

const NIVEL_ORDER = ['iniciante', 'intermediario', 'avancado'];

// Níveis de exercise_library.nivel_minimo que um usuário do `nivel` dado pode
// receber. Nível ausente/desconhecido conta como intermediário — mesmo padrão
// de applyLevelAdjustment (workoutAdjustments.js) e de admin-generate-plan.
export function allowedNiveis(nivel) {
  const idx = NIVEL_ORDER.indexOf(nivel);
  return NIVEL_ORDER.slice(0, (idx === -1 ? 1 : idx) + 1);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toExerciseShape(row) {
  return { nome: row.nome, series: row.series, reps: row.reps, descanso: row.descanso, tecnica: row.tecnica };
}

// Sorteia até `count` exercícios de `candidates` (linhas de exercise_library
// já filtradas pelos grupos do dia e pelo nível), equilibrando entre os grupos:
//   1. até `compostoCount` compostos, um grupo por vez (na ordem de `grupos`);
//   2. pelo menos um exercício de cada grupo que ainda não apareceu (senão um
//      dia "Peito / Ombro / Tríceps" podia sair só com peito);
//   3. completa o total alternando entre os grupos, isolados antes de compostos.
// Nunca repete exercício e nunca retorna menos do que `candidates` permite.
// Sem `grupos`, usa a ordem em que os grupos aparecem em `candidates`.
export function pickExercisesForFoco(candidates, { count = TARGET_COUNT, compostoCount = COMPOSTO_COUNT, grupos } = {}) {
  const groupOf = c => c.grupo_muscular ?? '';
  const order = grupos ?? [...new Set(candidates.map(groupOf))];

  const compostos = new Map(order.map(g => [g, []]));
  const outros = new Map(order.map(g => [g, []]));
  shuffle(candidates).forEach(c => {
    const bucket = c.tipo === 'composto' ? compostos : outros;
    if (bucket.has(groupOf(c))) bucket.get(groupOf(c)).push(c);
  });

  const picked = [];
  const pickedNames = new Set();
  const coveredGroups = new Set();
  function take(bucket, grupo) {
    const list = bucket.get(grupo);
    while (list.length) {
      const c = list.shift();
      if (!pickedNames.has(c.nome)) {
        picked.push(c);
        pickedNames.add(c.nome);
        coveredGroups.add(grupo);
        return true;
      }
    }
    return false;
  }
  // Uma passada por grupo pegando de `bucket`; repete enquanto alguma rodada
  // conseguir pegar algo e ainda couber mais.
  function roundRobin(bucket, limit) {
    let progressed = true;
    while (progressed && picked.length < limit) {
      progressed = false;
      for (const g of order) {
        if (picked.length >= limit) break;
        if (take(bucket, g)) progressed = true;
      }
    }
  }

  roundRobin(compostos, Math.min(count, compostoCount));
  for (const g of order) {
    if (picked.length >= count) break;
    if (!coveredGroups.has(g) && !take(outros, g)) take(compostos, g);
  }
  roundRobin(outros, count);
  roundRobin(compostos, count);

  return picked.map(toExerciseShape);
}

async function fetchLibraryRows(grupos, nivel) {
  const { data, error } = await db
    .from('exercise_library')
    .select('nome, grupo_muscular, tipo, series, reps, descanso, tecnica')
    .in('grupo_muscular', grupos)
    .in('nivel_minimo', allowedNiveis(nivel))
    .eq('is_post_workout', false);
  if (error) throw error;
  return data || [];
}

// Substitui `exercicios` dos dias de treino de força por uma seleção nova da
// biblioteca, mantendo `pos` (cardio/core do pós-treino) e a estrutura do dia
// intactos. Busca a biblioteca uma vez só (todos os grupos da semana) e
// filtra por nível de experiência (exercise_library.nivel_minimo), pra
// iniciante não receber levantamento livre técnico que LEVEL_EXERCISE_SUBS não
// cobre. Dias sem mapeamento de foco (rest/cardio-leve/corrida) ou com pool
// insuficiente ficam como vieram do template — mesmo espírito de resiliência
// de fetchBaseTemplate (rede indisponível não quebra a geração, só reduz a
// variedade).
export async function withLibraryExercises(days, nivel) {
  const allGrupos = [...new Set(days.flatMap(d => FOCO_TO_GRUPOS[d.foco] || []))];
  if (!allGrupos.length) return days;

  let rows;
  try {
    rows = await fetchLibraryRows(allGrupos, nivel);
  } catch (err) {
    console.warn('withLibraryExercises:', err);
    return days;
  }

  return days.map(day => {
    const grupos = FOCO_TO_GRUPOS[day.foco];
    if (!grupos) return day;
    const candidates = rows.filter(r => grupos.includes(r.grupo_muscular));
    if (candidates.length < MIN_POOL_SIZE) return day;
    return { ...day, exercicios: pickExercisesForFoco(candidates, { grupos }) };
  });
}
