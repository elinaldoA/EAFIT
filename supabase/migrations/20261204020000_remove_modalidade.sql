-- Modalidade (musculação/calistenia/corrida) removida do app: todo mundo volta
-- a ser musculação. O painel admin deixa de ter a tabela por modalidade, a
-- comparação por local volta a contar todos os usuários e o template-base
-- 'calistenia' (usado só por essa modalidade) sai de workout_templates. Planos
-- já criados a partir dele não são tocados (cada plano guarda seus dias).

drop function if exists public.admin_modality_breakdown();

delete from public.workout_templates where meta = 'calistenia';

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
             case when x.raw_user_meta_data->>'local' in ('casa', 'condominio') then x.raw_user_meta_data->>'local' else 'academia' end as place,
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
