import { db } from './supabase';
import { todayInAppZone } from './appConfig';

// Novo aceite dos Termos/Privacidade. O painel admin registra quando uma
// versão nova entra em vigor (tabela legal_versions); quem aceitou antes dessa
// data — ou nunca teve o aceite gravado — precisa aceitar de novo.
// Fail-open: sem resposta do servidor (offline, função ainda não publicada),
// o app segue normal em vez de travar a pessoa.
const FETCH_TIMEOUT_MS = 4000;

// Data (YYYY-MM-DD) da mudança mais recente já em vigor, ou null.
export async function fetchCurrentLegalDate() {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS));
  const { data, error } = await Promise.race([db.rpc('current_legal_date'), timeout]);
  if (error) throw error;
  return typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

// Dia do aceite no fuso do app, ou null se não há aceite válido gravado.
export function acceptedDay(user) {
  const raw = user?.user_metadata?.termsAcceptedAt;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(time) ? todayInAppZone(new Date(time)) : null;
}

export function needsNewAcceptance(user, legalDate) {
  if (!user || !legalDate) return false;
  const day = acceptedDay(user);
  return !day || day < legalDate;
}
