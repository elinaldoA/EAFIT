import { db } from './supabase';
import { parseLocalDate, toDateStr } from './utils';
import { todayDate } from '../data/treinoData';

const RECENT_DAYS = 14;

export async function logDiscomfort(userId, exerciseName, logDate, severity, note) {
  const { error } = await db.from('exercise_discomfort').insert({
    user_id: userId,
    exercise_name: exerciseName,
    log_date: logDate,
    severity,
    note: note?.trim() || null,
  });
  if (error) throw error;
}

// Relato de desconforto mais recente (últimos RECENT_DAYS dias) pra um exercício,
// usado pra avisar o usuário quando o mesmo exercício reincide. Retorna null se
// não houver nenhum relato recente.
export async function fetchRecentDiscomfort(userId, exerciseName) {
  const since = parseLocalDate(todayDate());
  since.setDate(since.getDate() - RECENT_DAYS);

  const { data, error } = await db
    .from('exercise_discomfort')
    .select('severity, note, log_date')
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName)
    .gte('log_date', toDateStr(since))
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Todos os relatos do usuário, mais recentes primeiro — usado no histórico
// agregado da aba Evolução (diferente de fetchRecentDiscomfort, não filtra
// por exercício). Sem paginação: 100 é generoso pro volume real desse dado.
export async function fetchAllDiscomfort(userId, limit = 100) {
  const { data, error } = await db
    .from('exercise_discomfort')
    .select('id, exercise_name, severity, note, log_date')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Agrupa relatos por exercício (contagem + severidade/data mais recente),
// ordenado por contagem desc, pra evidenciar reincidência no histórico.
export function summarizeDiscomfortByExercise(reports) {
  const byExercise = new Map();
  for (const r of reports) {
    const entry = byExercise.get(r.exercise_name) || {
      exerciseName: r.exercise_name, count: 0, lastSeverity: null, lastDate: null,
    };
    entry.count++;
    if (!entry.lastDate || r.log_date > entry.lastDate) {
      entry.lastDate = r.log_date;
      entry.lastSeverity = r.severity;
    }
    byExercise.set(r.exercise_name, entry);
  }
  return [...byExercise.values()].sort((a, b) => b.count - a.count);
}
