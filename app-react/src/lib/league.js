import { db } from './supabase';
import { trackFeature } from './tracking';
import { t } from './i18n';

// Liga mensal (supabase/migrations/20261128180000_leagues.sql): só entra quem
// toca em "Participar". A divisão vem dos dias treinados no mês anterior; os 3
// primeiros de cada divisão ganham medalha no fechamento do mês.

export const DIVISIONS = {
  bronze: { emoji: '🥉', label: t('Bronze') },
  prata: { emoji: '🥈', label: t('Prata') },
  ouro: { emoji: '🥇', label: t('Ouro') },
};

export const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// "2026-10" → "10/2026"
export function monthLabel(month) {
  const [y, m] = String(month || '').split('-');
  return y && m ? `${m}/${y}` : '';
}

// Medalha da liga pelo id gravado no fechamento (liga_ouro_1_2026-10).
export function parseLeagueBadge(id) {
  const m = /^liga_(bronze|prata|ouro)_([123])_(\d{4}-\d{2})$/.exec(String(id || ''));
  if (!m) return null;
  return { division: m[1], position: Number(m[2]), month: m[3] };
}

export async function fetchMyLeague() {
  const { data, error } = await db.rpc('my_league');
  if (error) throw error;
  return data || { enabled: false };
}

export async function joinLeague() {
  const { error } = await db.rpc('join_league');
  if (error) throw error;
  trackFeature('liga');
}

export async function leaveLeague() {
  const { error } = await db.rpc('leave_league');
  if (error) throw error;
}

// Para o backup: resultados fechados de cada mês.
export async function fetchMyLeagueResults() {
  const { data, error } = await db.from('league_results').select('month, division, days, position').order('month');
  if (error) throw error;
  return data || [];
}
