-- Ambiente do personal, versão profissional: painel com fila do que fazer,
-- carteira com etiquetas e situação do plano de cada aluno, edição de modelos
-- no lugar e histórico de planos do aluno.
--
-- Mesmas regras do restante do ambiente do personal: tabela nova com RLS
-- ligado e sem policies, acesso só por funções security definer que conferem
-- is_trainer / is_trainer_of. As etiquetas ficam fora de trainer_clients de
-- propósito: o aluno tem policy de leitura no próprio vínculo e não deve ver
-- como o personal o classificou ("inadimplente", "online"...).
--
-- Nada aqui troca funções existentes: trainer_clients_overview segue igual
-- para as versões antigas do app; a nova trainer_roster traz tudo numa
-- chamada (e chama training_days() uma vez só, em vez de uma por aluno).

create table if not exists public.trainer_client_meta (
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (trainer_id, client_id)
);

alter table public.trainer_client_meta enable row level security;

-- ---------------------------------------------------------------------------
-- Etiquetas do aluno (até 6, cada uma com 1 a 20 caracteres). Repetidas e em
-- branco são descartadas; lista vazia apaga.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_set_client_tags(p_client uuid, p_tags text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tags text[];
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  select coalesce(array_agg(tag order by first_pos), '{}') into v_tags
  from (
    select btrim(x.tag) as tag, min(x.pos) as first_pos
    from unnest(coalesce(p_tags, '{}')) with ordinality as x(tag, pos)
    where length(btrim(coalesce(x.tag, ''))) > 0
    group by btrim(x.tag)
  ) q;

  if array_length(v_tags, 1) > 6 or exists (select 1 from unnest(v_tags) t where length(t) > 20) then
    raise exception 'invalid_tags';
  end if;

  insert into public.trainer_client_meta (trainer_id, client_id, tags, updated_at)
  values (auth.uid(), p_client, v_tags, now())
  on conflict (trainer_id, client_id) do update set tags = excluded.tags, updated_at = now();

  return v_tags;
end;
$$;

-- ---------------------------------------------------------------------------
-- Carteira do personal: o resumo de trainer_clients_overview mais meta
-- semanal, plano ativo (nome, dias, fim, se foi ele quem montou), relatos de
-- dor forte/lesão em 7 dias, etiquetas e os dias treinados nos últimos 14.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_roster()
returns table (
  rs_id uuid,
  rs_name text,
  rs_email text,
  rs_since timestamptz,
  rs_last_day date,
  rs_days_7 int,
  rs_days_30 int,
  rs_paused boolean,
  rs_goal text,
  rs_level text,
  rs_weekly_goal int,
  rs_plan_name text,
  rs_plan_days int,
  rs_plan_end date,
  rs_plan_by_me boolean,
  rs_pain_7 int,
  rs_tags text[],
  rs_recent date[]
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  return query
    with mine as (
      select c.client_id, c.linked_at
      from public.trainer_clients c
      where c.trainer_id = auth.uid() and c.status = 'active'
    ),
    td as (
      select d.user_id, d.day
      from public.training_days() d
      where d.user_id in (select m.client_id from mine m)
    ),
    agg as (
      select td.user_id,
             max(td.day) as last_day,
             count(*) filter (where td.day >= today - 6)::int as d7,
             count(*) filter (where td.day >= today - 29)::int as d30,
             array_agg(td.day order by td.day) filter (where td.day >= today - 13) as recent
      from td
      group by td.user_id
    )
    select m.client_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)),
           u.email::text,
           m.linked_at,
           a.last_day,
           coalesce(a.d7, 0),
           coalesce(a.d30, 0),
           case
             when (u.raw_user_meta_data->>'pausedUntil') ~ '^\d{4}-\d{2}-\d{2}$'
             then (u.raw_user_meta_data->>'pausedUntil') >= today::text
             else false
           end,
           u.raw_user_meta_data->>'meta',
           u.raw_user_meta_data->>'nivel',
           case when (u.raw_user_meta_data->>'weeklyGoal') ~ '^[1-7]$' then (u.raw_user_meta_data->>'weeklyGoal')::int end,
           p.name,
           p.days,
           p.end_date,
           p.by_me,
           (select count(*) from public.exercise_discomfort x
             where x.user_id = m.client_id and x.severity in ('forte', 'lesao') and x.log_date >= today - 6)::int,
           coalesce(meta.tags, '{}'),
           coalesce(a.recent, '{}')
    from mine m
    join auth.users u on u.id = m.client_id
    left join agg a on a.user_id = m.client_id
    left join public.trainer_client_meta meta on meta.trainer_id = auth.uid() and meta.client_id = m.client_id
    left join lateral (
      select wp.name, wp.end_date, wp.created_by = auth.uid() as by_me,
             (select count(*) from public.plan_days pd where pd.plan_id = wp.id)::int as days
      from public.workout_plans wp
      where wp.user_id = m.client_id and wp.is_active
      limit 1
    ) p on true
    order by a.last_day desc nulls last;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atualiza um modelo existente (mesmas regras de trainer_save_template).
-- ---------------------------------------------------------------------------
create or replace function public.trainer_update_template(p_id uuid, p_name text, p_days jsonb, p_weeks int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  if p_name is null or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 60 then raise exception 'invalid_name'; end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) not between 1 and 7 then
    raise exception 'invalid_days';
  end if;
  if p_weeks is not null and p_weeks not between 1 and 52 then raise exception 'invalid_duration'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_days) d
    where jsonb_typeof(d->'exercicios') <> 'array'
       or jsonb_array_length(d->'exercicios') not between 1 and 20
       or exists (select 1 from jsonb_array_elements(d->'exercicios') e where length(btrim(coalesce(e->>'nome', ''))) = 0)
  ) then
    raise exception 'invalid_exercises';
  end if;

  update public.trainer_templates t
     set name = btrim(p_name), duration_weeks = p_weeks, days = p_days
   where t.id = p_id and t.trainer_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Histórico de planos do aluno (os 20 mais recentes), para o personal ver os
-- ciclos que já passaram e quem montou cada um. Só com vínculo ativo.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_client_plans(p_client uuid)
returns table (
  pl_id uuid, pl_name text, pl_at timestamptz, pl_start date, pl_end date,
  pl_weeks int, pl_active boolean, pl_by_me boolean, pl_days int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  return query
    select p.id, p.name, p.created_at, p.start_date, p.end_date, p.duration_weeks, p.is_active,
           coalesce(p.created_by = auth.uid(), false),
           (select count(*) from public.plan_days pd where pd.plan_id = p.id)::int
    from public.workout_plans p
    where p.user_id = p_client
    order by p.is_active desc, p.created_at desc
    limit 20;
end;
$$;

revoke execute on function public.trainer_set_client_tags(uuid, text[]) from public, anon;
revoke execute on function public.trainer_roster() from public, anon;
revoke execute on function public.trainer_update_template(uuid, text, jsonb, int) from public, anon;
revoke execute on function public.trainer_client_plans(uuid) from public, anon;
grant execute on function public.trainer_set_client_tags(uuid, text[]) to authenticated;
grant execute on function public.trainer_roster() to authenticated;
grant execute on function public.trainer_update_template(uuid, text, jsonb, int) to authenticated;
grant execute on function public.trainer_client_plans(uuid) to authenticated;
