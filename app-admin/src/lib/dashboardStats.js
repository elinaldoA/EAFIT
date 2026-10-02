import { db } from './supabase';

export async function fetchDashboardStats() {
  const { data, error } = await db.rpc('admin_dashboard_stats');
  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchSignupsByDay(days = 14) {
  const { data, error } = await db.rpc('admin_signups_by_day', { days_back: days });
  if (error) throw error;
  return data || [];
}

// days: 7/30/90 = cadastrados nesse período; 0 = todos.
export async function fetchFunnel(days = 30) {
  const { data, error } = await db.rpc('admin_funnel', { days_back: days });
  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchRetentionCohorts(weeks = 8) {
  const { data, error } = await db.rpc('admin_retention_cohorts', { weeks });
  if (error) throw error;
  return data || [];
}

export async function fetchVisitSources(days = 30) {
  const { data, error } = await db.rpc('admin_visit_sources', { days_back: days });
  if (error) throw error;
  return data || [];
}
