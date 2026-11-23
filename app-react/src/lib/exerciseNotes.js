import { db } from './supabase';

// Nota curta por exercício, guardada por usuário (tabela exercise_notes) e
// espelhada no aparelho: aparece na hora ao abrir o exercício e continua
// legível sem rede. Se a tabela não responde, a nota fica só no aparelho.
export const NOTE_MAX = 280;
const localKey = (userId, nome) => `exnote_${userId}_${nome}`;

export function readLocalNote(userId, nome) {
  try { return localStorage.getItem(localKey(userId, nome)) || ''; } catch { return ''; }
}

function writeLocalNote(userId, nome, note) {
  try {
    if (note) localStorage.setItem(localKey(userId, nome), note);
    else localStorage.removeItem(localKey(userId, nome));
  } catch { /* cota cheia: a nota só não fica no aparelho */ }
}

export async function fetchExerciseNote(userId, nome) {
  const { data, error } = await db
    .from('exercise_notes')
    .select('note')
    .eq('user_id', userId)
    .eq('exercise_name', nome)
    .maybeSingle();
  if (error) throw error;
  const note = data?.note || '';
  writeLocalNote(userId, nome, note);
  return note;
}

// Todas as notas da pessoa (backup completo).
export async function fetchAllExerciseNotes(userId) {
  const { data, error } = await db
    .from('exercise_notes')
    .select('exercise_name, note, updated_at')
    .eq('user_id', userId)
    .order('exercise_name');
  if (error) throw error;
  return data || [];
}

// Nota vazia apaga. Devolve o texto gravado (cortado em NOTE_MAX).
export async function saveExerciseNote(userId, nome, text) {
  const note = String(text || '').trim().slice(0, NOTE_MAX);
  writeLocalNote(userId, nome, note);
  const query = db.from('exercise_notes');
  const { error } = note
    ? await query.upsert({ user_id: userId, exercise_name: nome, note, updated_at: new Date().toISOString() })
    : await query.delete().eq('user_id', userId).eq('exercise_name', nome);
  if (error) throw error;
  return note;
}
