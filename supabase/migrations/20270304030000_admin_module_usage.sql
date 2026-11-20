-- Painel admin → Pessoas → Uso por módulo: quem usa musculação, quem usa só o
-- Run, quem usa os dois, e quem ainda não fez nada.
--
-- Duas coisas diferentes, de propósito:
--   declarado = o módulo que a conta escolheu (user_metadata.esporte; sem
--               escolha vale musculação, como o app faz);
--   uso real  = o que a pessoa de fato registrou: treinos (training_days) e
--               corridas (runs). Quem escolheu Run mas só treinou, ou usa os
--               dois, aparece como é, não como declarou.
--
-- Uso (usage): 'musculacao' = só treinos, 'corrida' = só corridas, 'ambos',
-- 'nenhum' (nada registrado ainda). Admins ficam de fora, como em
-- admin_module_stats. Sem alterar admin_list_users_page de propósito: a lista
-- de usuários do painel é uma função grande que em produção pode estar
-- diferente do repositório.
--
-- Filtros de admin_module_users: 'musculacao', 'corrida', 'ambos', 'nenhum',
-- 'beta' (liberados no teste fechado do Run) e 'waitlist' (no pré-cadastro do
-- Run, por conta ou por e-mail). Vazio = todos.

create or replace function public.admin_module_usage_summary()
returns table (
  mu_total bigint, mu_only_strength bigint, mu_only_run bigint, mu_both bigint, mu_none bigint,
  mu_declared_run bigint, mu_beta bigint, mu_waitlist bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with t as (select distinct d.user_id from public.training_days() d),
         r as (select distinct x.user_id from public.runs x),
         w as (
           select distinct u.id from auth.users u
           join public.run_waitlist l on l.user_id = u.id or l.email = lower(u.email)
         ),
         b as (
           select x.id,
                  (t.user_id is not null) as has_t,
                  (r.user_id is not null) as has_r,
                  (x.raw_user_meta_data->>'esporte' = 'corrida') as decl_run,
                  coalesce((x.raw_app_meta_data->'beta_modules') ? 'corrida', false) as beta,
                  (w.id is not null) as wait
           from auth.users x
           left join public.profiles p on p.id = x.id
           left join t on t.user_id = x.id
           left join r on r.user_id = x.id
           left join w on w.id = x.id
           where not coalesce(p.is_admin, false)
         )
    select count(*)::bigint,
           count(*) filter (where has_t and not has_r)::bigint,
           count(*) filter (where has_r and not has_t)::bigint,
           count(*) filter (where has_t and has_r)::bigint,
           count(*) filter (where not has_t and not has_r)::bigint,
           count(*) filter (where decl_run)::bigint,
           count(*) filter (where beta)::bigint,
           count(*) filter (where wait)::bigint
    from b;
end;
$$;

revoke all on function public.admin_module_usage_summary() from public, anon;
grant execute on function public.admin_module_usage_summary() to authenticated;

create or replace function public.admin_module_users(
  p_filter text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  mu_id uuid, mu_email text, mu_name text, mu_declared text, mu_usage text,
  mu_beta boolean, mu_waitlist boolean,
  mu_train_30d bigint, mu_last_train date, mu_runs_30d bigint, mu_last_run date,
  mu_created_at timestamptz, mu_total bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_filter text := nullif(btrim(p_filter), '');
  v_search text := nullif(btrim(p_search), '');
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if v_filter is not null and v_filter not in ('musculacao', 'corrida', 'ambos', 'nenhum', 'beta', 'waitlist') then
    raise exception 'invalid_filter';
  end if;

  return query
    with t as (
      select d.user_id, max(d.day) as last_day, count(*) filter (where d.day > today - 30) as d30
      from public.training_days() d group by d.user_id
    ),
    r as (
      select x.user_id, max(x.run_date) as last_day, count(*) filter (where x.run_date > today - 30) as d30
      from public.runs x group by x.user_id
    ),
    base as (
      select x.id,
             x.email::text as email,
             coalesce(nullif(btrim(x.raw_user_meta_data->>'nome'), ''), nullif(btrim(x.raw_user_meta_data->>'apelido'), ''), x.email::text) as name,
             case when x.raw_user_meta_data->>'esporte' = 'corrida' then 'corrida' else 'musculacao' end as declared,
             case when t.user_id is not null and r.user_id is not null then 'ambos'
                  when t.user_id is not null then 'musculacao'
                  when r.user_id is not null then 'corrida'
                  else 'nenhum' end as usage,
             coalesce((x.raw_app_meta_data->'beta_modules') ? 'corrida', false) as beta,
             exists (select 1 from public.run_waitlist l where l.user_id = x.id or l.email = lower(x.email)) as wait,
             coalesce(t.d30, 0)::bigint as train30, t.last_day as last_train,
             coalesce(r.d30, 0)::bigint as runs30, r.last_day as last_run,
             x.created_at
      from auth.users x
      left join public.profiles p on p.id = x.id
      left join t on t.user_id = x.id
      left join r on r.user_id = x.id
      where not coalesce(p.is_admin, false)
    ),
    filtered as (
      select * from base b
      where (v_filter is null
             or (v_filter in ('musculacao', 'corrida', 'ambos', 'nenhum') and b.usage = v_filter)
             or (v_filter = 'beta' and b.beta)
             or (v_filter = 'waitlist' and b.wait))
        and (v_search is null or b.email ilike '%' || v_search || '%' or b.name ilike '%' || v_search || '%')
    )
    select f.id, f.email, f.name, f.declared, f.usage, f.beta, f.wait,
           f.train30, f.last_train, f.runs30, f.last_run, f.created_at,
           count(*) over ()::bigint
    from filtered f
    order by f.created_at desc
    limit greatest(least(coalesce(p_limit, 50), 500), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_module_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_module_users(text, text, integer, integer) to authenticated;
