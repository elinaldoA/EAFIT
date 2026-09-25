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
