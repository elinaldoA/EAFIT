-- Painel admin: ranking de exercícios e planos e fila de qualidade da
-- biblioteca (Conteúdo → Biblioteca de exercícios).
--
-- exercise_swaps: cada troca de exercício feita pelo aluno no app ("Trocar
-- exercício" = 'escolha'; troca sugerida depois de dor forte = 'dor'). Só o
-- app grava, pela função log_exercise_swap; só admin lê.

create table if not exists public.exercise_swaps (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_name text not null check (char_length(from_name) between 1 and 120),
  to_name text not null check (char_length(to_name) between 1 and 120),
  reason text not null default 'escolha' check (reason in ('escolha', 'dor')),
  created_at timestamptz not null default now()
);

create index if not exists exercise_swaps_created_idx on public.exercise_swaps (created_at);
create index if not exists exercise_swaps_user_idx on public.exercise_swaps (user_id);

alter table public.exercise_swaps enable row level security;

drop policy if exists "admin reads exercise swaps" on public.exercise_swaps;
create policy "admin reads exercise swaps" on public.exercise_swaps
  for select using (public.is_admin());

revoke all on public.exercise_swaps from anon, authenticated;
grant select on public.exercise_swaps to authenticated;

create or replace function public.log_exercise_swap(p_from text, p_to text, p_reason text default 'escolha')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then return; end if;
  if coalesce(btrim(p_from), '') = '' or coalesce(btrim(p_to), '') = '' or btrim(p_from) = btrim(p_to) then return; end if;
  insert into public.exercise_swaps (user_id, from_name, to_name, reason)
  values (auth.uid(), left(btrim(p_from), 120), left(btrim(p_to), 120),
          case when p_reason = 'dor' then 'dor' else 'escolha' end);
end;
$$;

revoke execute on function public.log_exercise_swap(text, text, text) from public, anon;
grant execute on function public.log_exercise_swap(text, text, text) to authenticated;

-- Por exercício, no período (days_back <= 0 = desde sempre):
--   er_in_plans    pessoas com o exercício no plano ativo (hoje)
--   er_planned     vezes em que estava no treino de um dia em que a pessoa treinou
--   er_done        dessas, vezes com ao menos uma série concluída
--   er_users       pessoas que fizeram ao menos uma série
--   er_swapped_out / er_swapped_in  trocas registradas (saiu / entrou)
--   er_pain        relatos de desconforto forte ou lesão
-- Pós-treino (alongamentos) fica de fora. Sem admins.
create or replace function public.admin_exercise_ranking(days_back int default 30)
returns table (
  er_name text, er_in_plans bigint, er_planned bigint, er_done bigint, er_users bigint,
  er_swapped_out bigint, er_swapped_in bigint, er_pain bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when coalesce(days_back, 30) <= 0 then '-infinity'::date else today - (least(days_back, 3650) - 1) end;
  since_ts timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz else now() - make_interval(days => least(days_back, 3650)) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin_w as (
      select w.id, w.user_id from public.workouts w
      left join public.profiles p on p.id = w.user_id
      where w.workout_date >= since and w.workout_date <= today and not coalesce(p.is_admin, false)
        and exists (select 1 from public.exercise_sets s where s.workout_id = w.id and s.completed)
    ),
    planned as (
      select l.exercise_name as name, count(*) as planned,
             count(*) filter (where exists (
               select 1 from public.exercise_sets s
               where s.workout_id = l.workout_id and s.exercise_name = l.exercise_name and s.completed)) as done
      from public.exercise_logs l
      join nonadmin_w w on w.id = l.workout_id
      where not coalesce(l.is_post_workout, false)
      group by l.exercise_name
    ),
    users_done as (
      select s.exercise_name as name, count(distinct w.user_id) as users
      from public.exercise_sets s join nonadmin_w w on w.id = s.workout_id
      where s.completed group by s.exercise_name
    ),
    in_plans as (
      select pe.nome as name, count(distinct wp.user_id) as n
      from public.plan_exercises pe
      join public.plan_days pd on pd.id = pe.plan_day_id
      join public.workout_plans wp on wp.id = pd.plan_id and wp.is_active
      left join public.profiles p on p.id = wp.user_id
      where not pe.is_post_workout and not coalesce(p.is_admin, false)
      group by pe.nome
    ),
    sw as (
      select x.name, sum(x.out_n) as out_n, sum(x.in_n) as in_n from (
        select from_name as name, count(*) as out_n, 0::bigint as in_n from public.exercise_swaps where created_at >= since_ts group by from_name
        union all
        select to_name, 0, count(*) from public.exercise_swaps where created_at >= since_ts group by to_name
      ) x group by x.name
    ),
    pain as (
      select d.exercise_name as name, count(*) as n
      from public.exercise_discomfort d
      left join public.profiles p on p.id = d.user_id
      where d.severity in ('forte', 'lesao') and d.log_date >= since and not coalesce(p.is_admin, false)
      group by d.exercise_name
    ),
    names as (
      select name from planned union select name from in_plans union select name from sw union select name from pain
    )
    select n.name,
           coalesce(ip.n, 0)::bigint, coalesce(pl.planned, 0)::bigint, coalesce(pl.done, 0)::bigint,
           coalesce(ud.users, 0)::bigint, coalesce(sw.out_n, 0)::bigint, coalesce(sw.in_n, 0)::bigint,
           coalesce(pa.n, 0)::bigint
    from names n
    left join in_plans ip on ip.name = n.name
    left join planned pl on pl.name = n.name
    left join users_done ud on ud.name = n.name
    left join sw on sw.name = n.name
    left join pain pa on pa.name = n.name;
end;
$$;

-- Planos agrupados pelo nome (os gerados pelo app e os modelos dos personais
-- repetem o nome), começados no período:
--   pr_plans / pr_users        quantos planos e pessoas
--   pr_by_trainer              quantos foram montados por um personal
--   pr_planned / pr_done       dias de força previstos até hoje (ou até o fim)
--                              e dias treinados nesse intervalo (teto por plano)
--   pr_finished / pr_finished_active  planos já terminados e, deles, quantos
--                              tiveram treino na última semana do ciclo
create or replace function public.admin_plan_ranking(days_back int default 90)
returns table (
  pr_name text, pr_plans bigint, pr_users bigint, pr_by_trainer bigint,
  pr_planned numeric, pr_done numeric, pr_finished bigint, pr_finished_active bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when coalesce(days_back, 90) <= 0 then '-infinity'::date else today - least(days_back, 3650) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with pl as (
      select wp.id, wp.user_id, btrim(wp.name) as name, wp.created_by,
             coalesce(wp.start_date, (wp.created_at at time zone 'America/Sao_Paulo')::date) as s,
             wp.end_date as e
      from public.workout_plans wp
      left join public.profiles p on p.id = wp.user_id
      where not coalesce(p.is_admin, false)
        and coalesce(wp.start_date, (wp.created_at at time zone 'America/Sao_Paulo')::date) >= since
        and btrim(wp.name) <> ''
    ),
    per_week as (
      select pd.plan_id, count(*) as n
      from public.plan_days pd
      where pd.plan_id in (select id from pl)
        and btrim(pd.foco) <> '' and pd.foco !~* 'descanso'
        and exists (select 1 from public.plan_exercises pe where pe.plan_day_id = pd.id and not pe.is_post_workout)
      group by pd.plan_id
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.user_id in (select user_id from pl)
    ),
    m as (
      select pl.*, coalesce(pw.n, 0) as per_week,
             least(coalesce(pl.e, today), today) as upto,
             (select count(*) from td where td.user_id = pl.user_id and td.day between pl.s and least(coalesce(pl.e, today), today)) as trained,
             (pl.e is not null and pl.e < today) as finished,
             (pl.e is not null and pl.e < today
              and exists (select 1 from td where td.user_id = pl.user_id and td.day between pl.e - 6 and pl.e)) as finished_active
      from pl left join per_week pw on pw.plan_id = pl.id
    )
    select m.name, count(*)::bigint, count(distinct m.user_id)::bigint,
           count(*) filter (where m.created_by is not null and m.created_by <> m.user_id)::bigint,
           round(sum(m.per_week * greatest(m.upto - m.s + 1, 0) / 7.0), 1),
           round(sum(least(m.trained::numeric, m.per_week * greatest(m.upto - m.s + 1, 0) / 7.0)), 1),
           count(*) filter (where m.finished)::bigint,
           count(*) filter (where m.finished_active)::bigint
    from m
    where m.per_week > 0
    group by m.name
    order by count(*) desc
    limit 100;
end;
$$;

-- Fila de qualidade da biblioteca: todos os exercícios com as pendências que
-- dá para ver no banco e quantas pessoas têm cada um no plano ativo (para
-- priorizar). A demonstração padrão (vídeo ou quadros do Free Exercise DB)
-- fica no código do app, então o painel cruza lq_custom_media com ela.
--   lq_custom_media  tem demonstração própria (exercise_media)
--   lq_no_equipment  sem equipamento informado (o filtro academia/casa usa)
--   lq_short_tech    técnica com menos de 40 caracteres
create or replace function public.admin_library_quality()
returns table (
  lq_name text, lq_group text, lq_type text, lq_post boolean, lq_in_plans bigint,
  lq_custom_media boolean, lq_no_equipment boolean, lq_short_tech boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with in_plans as (
      select pe.nome as name, count(distinct wp.user_id) as n
      from public.plan_exercises pe
      join public.plan_days pd on pd.id = pe.plan_day_id
      join public.workout_plans wp on wp.id = pd.plan_id and wp.is_active
      group by pe.nome
    )
    select l.nome, l.grupo_muscular, l.tipo, l.is_post_workout, coalesce(ip.n, 0)::bigint,
           exists (select 1 from public.exercise_media m where m.nome = l.nome),
           coalesce(btrim(l.equipamento), '') = '',
           char_length(btrim(l.tecnica)) < 40
    from public.exercise_library l
    left join in_plans ip on ip.name = l.nome;
end;
$$;

revoke execute on function public.admin_exercise_ranking(int) from public, anon;
revoke execute on function public.admin_plan_ranking(int) from public, anon;
revoke execute on function public.admin_library_quality() from public, anon;
grant execute on function public.admin_exercise_ranking(int) to authenticated;
grant execute on function public.admin_plan_ranking(int) to authenticated;
grant execute on function public.admin_library_quality() to authenticated;
