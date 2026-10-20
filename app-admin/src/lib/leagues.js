import { db } from './supabase';
import { saveSetting } from './appSettings';
import { currentMonth } from './commissions';

// Liga mensal (Comunidade → Ligas). SQL em
// supabase/migrations/20261128180000_leagues.sql: entra quem quer, pelo app;
// divisão pelos dias do mês anterior; o cron fecha o mês no dia 1º.

export const DIVISIONS = [
  { key: 'ouro', label: 'Ouro', emoji: '🥇', rule: '14+ dias no mês anterior' },
  { key: 'prata', label: 'Prata', emoji: '🥈', rule: '8 a 13 dias' },
  { key: 'bronze', label: 'Bronze', emoji: '🥉', rule: 'até 7 dias ou novo na liga' },
];

export { currentMonth };

export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function mapStanding(r) {
  return {
    userId: r.lg_user, email: r.lg_email, name: r.lg_name, division: r.lg_division,
    days: Number(r.lg_days) || 0, position: Number(r.lg_position) || 0, closed: !!r.lg_closed,
  };
}

// Agrupa por divisão (na ordem Ouro, Prata, Bronze) com totais.
export function groupStandings(rows) {
  return DIVISIONS.map(d => {
    const list = rows.filter(r => r.division === d.key).sort((a, b) => a.position - b.position);
    return {
      ...d, rows: list, members: list.length,
      active: list.filter(r => r.days > 0).length,
      avgDays: list.length ? Math.round((list.reduce((a, r) => a + r.days, 0) / list.length) * 10) / 10 : null,
    };
  });
}

export async function fetchLeague(month) {
  const [standings, setting] = await Promise.all([
    db.rpc('admin_league_standings', { p_month: month }),
    db.from('app_settings').select('value').eq('key', 'league').maybeSingle(),
  ]);
  if (standings.error) throw standings.error;
  const rows = (standings.data || []).map(mapStanding);
  return { rows, closed: rows.some(r => r.closed), enabled: !!setting.data?.value?.enabled };
}

export function setLeagueEnabled(enabled, adminId) {
  return saveSetting('league', { enabled }, adminId);
}

export async function closeLeagueMonth(month) {
  const { data, error } = await db.rpc('admin_close_league', { p_month: month });
  if (error) throw error;
  return Number(data) || 0;
}
