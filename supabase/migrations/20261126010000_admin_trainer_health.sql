-- Painel admin: saúde da carteira dos personais (página "Personais"). Metas
-- semanais cumpridas, alunos parados, alunos sem contato e vínculos novos e
-- encerrados. Só contagens e datas — sem texto de recados, peso ou medidas.

-- Por aluno ativo de cada personal (p_trainer null = todos): dias treinados
-- nos últimos 30, último treino, meta semanal definida pelo personal, quantas
-- das últimas 4 semanas completas (seg–dom, horário de Brasília, só semanas
-- iniciadas depois do vínculo) bateram a meta e último contato (recado, aula
-- marcada ou aula confirmada que já aconteceu). Uso interno das RPCs abaixo.
create or replace function public.trainer_client_health(p_trainer uuid default null)
returns table (
  trainer_id uuid, client_id uuid, linked_at timestamptz,
  days30 bigint, last_day date,
  weekly_goal int, goal_weeks bigint, goal_hit bigint,
  last_contact timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with p as (select (now() at time zone 'America/Sao_Paulo')::date as today),
  cl as (
    select c.trainer_id, c.client_id, c.linked_at
    from public.trainer_clients c
    where c.status = 'active' and (p_trainer is null or c.trainer_id = p_trainer)
  ),
  td as (
    select t.user_id, t.day from public.training_days() t
    where t.user_id in (select cl.client_id from cl)
  ),
  wk as (
    select date_trunc('week', p.today::timestamp)::date - 7 * g as start
    from p, generate_series(1, 4) g
  )
  select cl.trainer_id, cl.client_id, cl.linked_at,
         (select count(*) from td, p where td.user_id = cl.client_id and td.day >= p.today - 30),
         (select max(td.day) from td where td.user_id = cl.client_id),
         g.weekly_goal,
         gw.weeks, gw.hit,
         greatest(
           (select max(m.created_at) from public.trainer_messages m
             where m.trainer_id = cl.trainer_id and m.client_id = cl.client_id),
           (select max(greatest(a.created_at, case when a.status = 'confirmed' and a.starts_at <= now() then a.starts_at end))
              from public.trainer_appointments a
             where a.trainer_id = cl.trainer_id and a.client_id = cl.client_id)
         )
  from cl
  left join public.trainer_goals g on g.client_id = cl.client_id and g.trainer_id = cl.trainer_id
  left join lateral (
    select count(*) as weeks,
           count(*) filter (where (select count(*) from td
                                    where td.user_id = cl.client_id and td.day >= wk.start and td.day < wk.start + 7)
                                  >= g.weekly_goal) as hit
    from wk
    where g.weekly_goal is not null
      and wk.start >= (cl.linked_at at time zone 'America/Sao_Paulo')::date
  ) gw on true;
$$;
revoke execute on function public.trainer_client_health(uuid) from public, anon, authenticated;

-- Por personal. Vínculos novos/encerrados seguem o período (days_back <= 0 =
-- desde sempre); o resto é a situação de hoje. Parado = vinculado há 14+ dias e
-- sem treinar há 14+ dias; sem contato = vinculado há 30+ dias e sem contato
-- há 30+ dias.
create or replace function public.admin_trainer_health(days_back int default 30)
returns table (
  th_user uuid, th_active bigint, th_new bigint, th_lost bigint,
  th_with_goal bigint, th_goal_weeks bigint, th_goal_hit bigint,
  th_idle14 bigint, th_no_contact30 bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz
                            else now() - make_interval(days => least(days_back, 3650)) end;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with h as (select * from public.trainer_client_health(null))
    select t.user_id,
           (select count(*) from h where h.trainer_id = t.user_id),
           (select count(*) from public.trainer_clients c where c.trainer_id = t.user_id and c.linked_at >= since),
           (select count(*) from public.trainer_clients c
             where c.trainer_id = t.user_id and c.status = 'revoked' and c.revoked_at >= since),
           (select count(*) from h where h.trainer_id = t.user_id and h.weekly_goal is not null),
           (select coalesce(sum(h.goal_weeks), 0)::bigint from h where h.trainer_id = t.user_id),
           (select coalesce(sum(h.goal_hit), 0)::bigint from h where h.trainer_id = t.user_id),
           (select count(*) from h
             where h.trainer_id = t.user_id and h.linked_at <= now() - interval '14 days'
               and (h.last_day is null or h.last_day <= today - 14)),
           (select count(*) from h
             where h.trainer_id = t.user_id and h.linked_at <= now() - interval '30 days'
               and (h.last_contact is null or h.last_contact < now() - interval '30 days'))
    from public.trainers t;
end;
$$;

-- Alunos ativos de um personal com os números acima, para abrir na linha dele.
create or replace function public.admin_trainer_clients_detail(p_trainer uuid)
returns table (
  tcd_user uuid, tcd_name text, tcd_since timestamptz, tcd_days30 bigint, tcd_last_day date,
  tcd_weekly_goal int, tcd_goal_weeks bigint, tcd_goal_hit bigint, tcd_last_contact timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select h.client_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text),
           h.linked_at, h.days30, h.last_day, h.weekly_goal, h.goal_weeks, h.goal_hit, h.last_contact
    from public.trainer_client_health(p_trainer) h
    join auth.users u on u.id = h.client_id
    order by h.linked_at desc;
end;
$$;

revoke execute on function public.admin_trainer_health(int) from public, anon;
revoke execute on function public.admin_trainer_clients_detail(uuid) from public, anon;
grant execute on function public.admin_trainer_health(int) to authenticated;
grant execute on function public.admin_trainer_clients_detail(uuid) to authenticated;
