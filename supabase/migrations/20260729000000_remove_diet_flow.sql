-- Remove o fluxo de dieta/cardápio do produto (mantém treino e água intactos).
-- Água (water_logs) NÃO é derrubada — vira feature independente, com meta
-- calculada só a partir do peso (ver app-react/src/data/treinoData.js:
-- getWaterGoalLiters). weight_logs também fica intocado (peso corporal, não
-- é dieta).

drop table if exists public.diet_logs cascade;
drop table if exists public.food_logs cascade;
drop table if exists public.saved_recipes cascade;
drop table if exists public.meal_templates cascade;

-- admin_dashboard_stats() perde total_food_logs; active_users_7d passa a
-- contar só por atividade de treino (antes fazia union com food_logs).
drop function if exists public.admin_dashboard_stats();

create function public.admin_dashboard_stats()
returns table (
  total_users bigint,
  users_last_7d bigint,
  users_last_30d bigint,
  confirmed_users bigint,
  banned_users bigint,
  admins_count bigint,
  total_workouts bigint,
  workouts_last_7d bigint,
  active_users_7d bigint,
  push_enabled_users bigint,
  severe_discomfort_30d bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select
      (select count(*) from auth.users),
      (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      (select count(*) from auth.users where email_confirmed_at is not null),
      (select count(*) from auth.users where banned_until is not null and banned_until > now()),
      (select count(*) from public.profiles where is_admin),
      (select count(*) from public.workouts),
      (select count(*) from public.workouts where created_at >= now() - interval '7 days'),
      (select count(distinct user_id) from public.workouts where created_at >= now() - interval '7 days'),
      (select count(distinct user_id) from public.push_subscriptions),
      (select count(*) from public.exercise_discomfort
         where severity in ('forte', 'lesao') and log_date >= current_date - interval '30 days');
end;
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;

-- Limpa chaves de dieta do metadata de usuário (mantém macroAgua, usado pela
-- meta de água em getWaterGoalLiters).
update auth.users
set raw_user_meta_data = raw_user_meta_data
  - 'restricaoAlimentar' - 'customMeals'
  - 'macroKcal' - 'macroProteina' - 'macroCarboidrato' - 'macroGordura'
where raw_user_meta_data ?| array['restricaoAlimentar', 'customMeals', 'macroKcal', 'macroProteina', 'macroCarboidrato', 'macroGordura'];
