-- Modalidade corrida removida do app: o painel passa a comparar só musculação ×
-- calistenia. Quem ainda tem modalidade 'corrida' no perfil conta como
-- musculação (o app também trata assim). Mesmas métricas de admin_place_breakdown (usuários, com plano,
-- treinaram em 30 dias, nunca treinaram, treinos por semana, retenção, dor),
-- agrupadas pela modalidade escolhida no cadastro ou no Perfil
-- (user_metadata.modalidade). Sem escolha (perfis antigos) conta como musculação.

create or replace function public.admin_modality_breakdown()
returns table (
  mb_modality text, mb_users bigint, mb_with_plan bigint, mb_trained30 bigint, mb_never bigint,
  mb_sessions_week numeric, mb_cohort bigint, mb_cohort_active bigint, mb_pain bigint
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
             case when x.raw_user_meta_data->>'modalidade' = 'calistenia'
                  then 'calistenia' else 'musculacao' end as modality,
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
      select u.modality, u.joined, coalesce(td.s30, 0) as s30, coalesce(td.s14, 0) as s14, coalesce(td.total, 0) as total,
             exists (select 1 from public.workout_plans wp where wp.user_id = u.id and wp.is_active) as has_plan,
             exists (select 1 from public.exercise_discomfort d
                      where d.user_id = u.id and d.severity in ('forte', 'lesao') and d.log_date > today - 30) as pain
      from u left join td on td.user_id = u.id
    )
    select b.modality, count(*)::bigint,
           count(*) filter (where b.has_plan),
           count(*) filter (where b.s30 > 0),
           count(*) filter (where b.total = 0),
           round(avg(b.s30::numeric) filter (where b.has_plan) * 7 / 30, 1),
           count(*) filter (where b.joined between today - 84 and today - 28),
           count(*) filter (where b.joined between today - 84 and today - 28 and b.s14 > 0),
           count(*) filter (where b.pain)
    from b group by b.modality;
end;
$$;

revoke execute on function public.admin_modality_breakdown() from public, anon;
grant execute on function public.admin_modality_breakdown() to authenticated;
