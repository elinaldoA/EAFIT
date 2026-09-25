// PORT literal de app-react/src/data/exerciseLibrary.js — mesmo motivo da
// duplicação de _shared/workoutAdjustments.ts (app-react e Edge Functions não
// compartilham build). Usado por admin-generate-plan/index.ts. Se
// exerciseLibrary.js mudar — sobretudo FOCO_TO_GRUPOS, allowedNiveis,
// pickExercisesForFoco ou as constantes — espelhar aqui também.
// exerciseLibrary.test.ts cobre este arquivo isoladamente.
import type { Day, Exercise } from './workoutAdjustments.ts';

export type LibraryRow = Exercise & { grupo_muscular?: string; tipo: string };

// Cliente mínimo que precisamos do supabase-js — recebido por parâmetro pra
// função não depender de variáveis de ambiente (e ficar testável).
type LibraryQuery = {
  in(col: string, values: string[]): LibraryQuery;
  eq(col: string, value: unknown): LibraryQuery;
} & PromiseLike<{ data: LibraryRow[] | null; error: unknown }>;
export type LibraryClient = { from(table: string): { select(cols: string): LibraryQuery } };

export const FOCO_TO_GRUPOS: Record<string, string[]> = {
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
const MIN_POOL_SIZE = 3;

const NIVEL_ORDER = ['iniciante', 'intermediario', 'avancado'];

export function allowedNiveis(nivel: string | undefined): string[] {
  const idx = NIVEL_ORDER.indexOf(nivel ?? '');
  return NIVEL_ORDER.slice(0, (idx === -1 ? 1 : idx) + 1);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toExerciseShape(row: LibraryRow): Exercise {
  return { nome: row.nome, series: row.series, reps: row.reps, descanso: row.descanso, tecnica: row.tecnica };
}

export function pickExercisesForFoco(
  candidates: LibraryRow[],
  { count = TARGET_COUNT, compostoCount = COMPOSTO_COUNT, grupos }: { count?: number; compostoCount?: number; grupos?: string[] } = {},
): Exercise[] {
  const groupOf = (c: LibraryRow) => c.grupo_muscular ?? '';
  const order = grupos ?? [...new Set(candidates.map(groupOf))];

  const compostos = new Map<string, LibraryRow[]>(order.map(g => [g, []]));
  const outros = new Map<string, LibraryRow[]>(order.map(g => [g, []]));
  shuffle(candidates).forEach(c => {
    const bucket = c.tipo === 'composto' ? compostos : outros;
    if (bucket.has(groupOf(c))) bucket.get(groupOf(c))!.push(c);
  });

  const picked: LibraryRow[] = [];
  const pickedNames = new Set<string>();
  const coveredGroups = new Set<string>();
  function take(bucket: Map<string, LibraryRow[]>, grupo: string): boolean {
    const list = bucket.get(grupo)!;
    while (list.length) {
      const c = list.shift()!;
      if (!pickedNames.has(c.nome)) {
        picked.push(c);
        pickedNames.add(c.nome);
        coveredGroups.add(grupo);
        return true;
      }
    }
    return false;
  }
  function roundRobin(bucket: Map<string, LibraryRow[]>, limit: number) {
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

export async function withLibraryExercises(client: LibraryClient, days: Day[], nivel: string | undefined): Promise<Day[]> {
  const allGrupos = [...new Set(days.flatMap(d => FOCO_TO_GRUPOS[d.foco] || []))];
  if (!allGrupos.length) return days;

  let rows: LibraryRow[];
  try {
    const { data, error } = await client
      .from('exercise_library')
      .select('nome, grupo_muscular, tipo, series, reps, descanso, tecnica')
      .in('grupo_muscular', allGrupos)
      .in('nivel_minimo', allowedNiveis(nivel))
      .eq('is_post_workout', false);
    if (error) throw error;
    rows = data || [];
  } catch (err) {
    console.warn('withLibraryExercises:', err);
    return days;
  }

  return days.map(day => {
    const grupos = FOCO_TO_GRUPOS[day.foco];
    if (!grupos) return day;
    const candidates = rows.filter(r => grupos.includes(r.grupo_muscular ?? ''));
    if (candidates.length < MIN_POOL_SIZE) return day;
    return { ...day, exercicios: pickExercisesForFoco(candidates, { grupos }) };
  });
}
