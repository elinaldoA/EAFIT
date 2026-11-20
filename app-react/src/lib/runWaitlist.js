import { db } from './supabase';

// Pré-cadastro do EAFIT Run (public.run_waitlist, ver
// supabase/migrations/20270304020000_run_waitlist.sql). Quem já tem conta
// entra com a própria conta: o e-mail vem do servidor, a origem fica 'app'.
// O site grava a mesma tabela direto (public/landing/assets/site.js).

export const WAITLIST_GOALS = [
  { value: '', label: 'Prefiro não dizer' },
  { value: 'comecar', label: 'Começar a correr' },
  { value: '5k', label: 'Correr 5 km' },
  { value: '10k', label: 'Correr 10 km' },
  { value: '21k', label: 'Meia maratona' },
  { value: '42k', label: 'Maratona' },
  { value: 'saude', label: 'Correr por saúde' },
];

// A pessoa logada já está na lista? Erro de rede conta como "não sei" (null):
// o card aparece e o toque idempotente resolve.
export async function inRunWaitlist() {
  try {
    const { data, error } = await db.rpc('in_run_waitlist');
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}

export async function joinRunWaitlist({ goal = '', source = 'app' } = {}) {
  const { error } = await db.rpc('join_run_waitlist', {
    p_source: source,
    p_goal: goal || null,
    p_level: null,
  });
  if (error) throw error;
}
