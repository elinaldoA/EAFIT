-- Painel admin: padrões de treino (Análises → Análise dos planos).
--   admin_training_heatmap  treinos por dia da semana × hora em que começaram
--                           (horário de Brasília; só treinos com cronômetro)
--   admin_place_breakdown   academia × casa (perfil → local; sem valor conta
--                           como academia, o padrão do app)
-- Sem admins.

create or replace function public.admin_training_heatmap(days_back int default 90)
returns table (th_dow int, th_hour int, th_sessions bigint, th_users bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(nullif(days_back, 0), 3650), 3650)));
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select extract(dow from (w.started_at at time zone 'America/Sao_Paulo'))::int,
           extract(hour from (w.started_at at time zone 'America/Sao_Paulo'))::int,
           count(*)::bigint, count(distinct w.user_id)::bigint
    from public.workouts w
    left join public.profiles p on p.id = w.user_id
    where w.started_at is not null and w.started_at >= since
      and (w.completed or w.finished_at is not null)
      and not coalesce(p.is_admin, false)
    group by 1, 2;
end;
$$;

-- Por local: usuários, com plano ativo, que treinaram nos últimos 30 dias,
-- treinos por semana (média dos 30 dias, só de quem tem plano), retenção de
-- quem começou há 4–12 semanas (treinou nas últimas 2) e quem registrou
-- desconforto forte ou lesão nos últimos 30 dias.
create or replace function public.admin_place_breakdown()
returns table (
  pb_place text, pb_users bigint, pb_with_plan bigint, pb_trained30 bigint, pb_never bigint,
  pb_sessions_week numeric, pb_cohort bigint, pb_cohort_active bigint, pb_pain bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with u as (
      select x.id,
             case when x.raw_user_meta_data->>'local' = 'casa' then 'casa' else 'academia' end as place,
             (x.created_at at time zone 'America/Sao_Paulo')::date as joined
      from auth.users x
      left join public.profiles p on p.id = x.id
      where not coalesce(p.is_admin, false)
    ),
    td as (
      select t.user_id, count(*) filter (where t.day > today - 30) as s30,
             count(*) filter (where t.day > today - 14) as s14, count(*) as total
      from public.training_days() t group by t.user_id
    ),
    b as (
      select u.place, u.joined, coalesce(td.s30, 0) as s30, coalesce(td.s14, 0) as s14, coalesce(td.total, 0) as total,
             exists (select 1 from public.workout_plans wp where wp.user_id = u.id and wp.is_active) as has_plan,
             exists (select 1 from public.exercise_discomfort d
                      where d.user_id = u.id and d.severity in ('forte', 'lesao') and d.log_date > today - 30) as pain
      from u left join td on td.user_id = u.id
    )
    select b.place, count(*)::bigint,
           count(*) filter (where b.has_plan),
           count(*) filter (where b.s30 > 0),
           count(*) filter (where b.total = 0),
           round(avg(b.s30::numeric) filter (where b.has_plan) * 7 / 30, 1),
           count(*) filter (where b.joined between today - 84 and today - 28),
           count(*) filter (where b.joined between today - 84 and today - 28 and b.s14 > 0),
           count(*) filter (where b.pain)
    from b group by b.place;
end;
$$;

revoke execute on function public.admin_training_heatmap(int) from public, anon;
revoke execute on function public.admin_place_breakdown() from public, anon;
grant execute on function public.admin_training_heatmap(int) to authenticated;
grant execute on function public.admin_place_breakdown() to authenticated;
