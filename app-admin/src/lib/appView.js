import { db } from './supabase';
import { bannerWindow, fetchSettings, seasonStatus, seasonThemeLabel } from './appSettings';
import { todayStr } from './community';

// Detalhe do usuário → Visão do app: o que o app mostra para a pessoa agora,
// só leitura. A RPC (supabase/migrations/20261128160000_admin_user_app_view.sql)
// registra cada abertura na auditoria.

export const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function dayName(dateStr) {
  return DAY_NAMES[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}

// Mesma regra do app (WorkoutContext): o dia do plano com o nome de hoje;
// sem dia = descanso. Pausa (pausedUntil) vale até a data, inclusive.
export function buildAppView({ plan, metadata, settings, view }, today = todayStr()) {
  const md = metadata || {};
  const name = dayName(today);
  const day = plan?.plan_days?.find(d => d.dia === name) || null;
  const banner = settings?.banner;
  const season = settings?.season ? seasonStatus(settings.season, today) : { key: 'desligado' };
  return {
    today, dayName: name,
    paused: md.pausedUntil && md.pausedUntil >= today ? md.pausedUntil : null,
    plan: plan ? { name: plan.name, ended: !!plan.end_date && plan.end_date < today } : null,
    day: day ? { foco: day.foco, exercises: (day.plan_exercises || []).filter(e => !e.is_post_workout) } : null,
    banner: banner?.enabled && banner.message && bannerWindow(banner, today) === 'no_ar' ? banner : null,
    theme: season.key === 'no_ar' ? seasonThemeLabel(season.theme) : null,
    lang: md.lang || 'pt',
    experiments: view?.experiments || [],
    survey: view?.survey || null,
    unread: Number(view?.unread) || 0,
    inbox: view?.inbox || [],
    weekDays: Number(view?.week_days) || 0,
    weekGoal: Number(md.weeklyGoal) || null,
    lastDay: view?.last_day || null,
  };
}

export async function fetchAppView(userId) {
  const [view, settings] = await Promise.all([
    db.rpc('admin_user_app_view', { p_user: userId }),
    fetchSettings(),
  ]);
  if (view.error) throw view.error;
  return { view: view.data, settings };
}
