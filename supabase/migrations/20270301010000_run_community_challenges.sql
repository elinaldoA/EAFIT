-- EAFIT Run: desafios da comunidade.
--
-- O admin (Conteúdo > Desafios do Run) cria um desafio com período e meta:
--   km     somar X km no período
--   hours  somar X horas de corrida no período
--   runs   fazer X corridas no período
-- Quem usa o app entra com um toque e o progresso sai das próprias corridas
-- (public.runs): conta tudo que tem run_date dentro do período, inclusive
-- corrida de esteira lançada à mão, privada ou feita antes de entrar no desafio.
-- O ranking mostra só nome (apelido ou primeiro nome) e total — nunca a corrida.
-- Entrar é a autorização para aparecer no ranking; sair tira a pessoa na hora.
--
-- As tabelas são fechadas para o app: tudo passa pelas funções abaixo (security
-- definer). O painel lê e escreve pelas policies admin_can('content').

create table if not exists public.run_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 60),
  description text check (description is null or char_length(description) <= 300),
  metric text not null check (metric in ('km', 'hours', 'runs')),
  goal numeric(8, 1) not null check (goal > 0 and goal <= 100000),
  start_date date not null,
  end_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 92)
);
create index if not exists run_challenges_dates_idx on public.run_challenges (end_date desc);

create table if not exists public.run_challenge_members (
  challenge_id uuid not null references public.run_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists run_challenge_members_user_idx on public.run_challenge_members (user_id);

alter table public.run_challenges enable row level security;
alter table public.run_challenge_members enable row level security;

drop policy if exists "run_challenges_admin" on public.run_challenges;
create policy "run_challenges_admin" on public.run_challenges
  for all using (admin_can('content'::text)) with check (admin_can('content'::text));

drop policy if exists "run_challenge_members_admin_select" on public.run_challenge_members;
create policy "run_challenge_members_admin_select" on public.run_challenge_members
  for select using (admin_can('content'::text));
drop policy if exists "run_challenge_members_admin_delete" on public.run_challenge_members;
create policy "run_challenge_members_admin_delete" on public.run_challenge_members
  for delete using (admin_can('content'::text));

-- Quanto a pessoa já fez no período, na unidade do desafio (km, horas ou corridas).
create or replace function public.run_challenge_value(p_metric text, p_user uuid, p_start date, p_end date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case p_metric
           when 'km' then coalesce(sum(r.distance_m), 0) / 1000.0
           when 'hours' then coalesce(sum(r.duration_s), 0) / 3600.0
           else count(r.id)::numeric
         end
  from public.runs r
  where r.user_id = p_user and r.run_date between p_start and p_end;
$$;

-- Desafios abertos no app: os ativos que ainda não acabaram (ou acabaram há até
-- 30 dias) e todos em que já entrei. Valor e posição só para quem entrou.
create or replace function public.my_run_challenges()
returns table (
  rch_id uuid, rch_title text, rch_description text, rch_metric text, rch_goal numeric,
  rch_start date, rch_end date, rch_members integer, rch_joined boolean, rch_value numeric, rch_rank integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
    with vis as (
      select c.*
      from public.run_challenges c
      where c.active
        and (c.end_date >= today - 30
             or exists (select 1 from public.run_challenge_members m where m.challenge_id = c.id and m.user_id = uid))
    ),
    mine as (select v.id from vis v join public.run_challenge_members m on m.challenge_id = v.id and m.user_id = uid),
    scores as (
      select m.challenge_id, m.user_id,
             public.run_challenge_value(v.metric, m.user_id, v.start_date, v.end_date) as val
      from public.run_challenge_members m
      join vis v on v.id = m.challenge_id
      where m.challenge_id in (select id from mine)
    ),
    ranked as (
      select s.challenge_id, s.user_id, s.val,
             rank() over (partition by s.challenge_id order by s.val desc)::int as rk
      from scores s
    )
    select v.id, v.title, v.description, v.metric, v.goal, v.start_date, v.end_date,
           (select count(*)::int from public.run_challenge_members m2 where m2.challenge_id = v.id),
           r.user_id is not null,
           r.val, r.rk
    from vis v
    left join ranked r on r.challenge_id = v.id and r.user_id = uid
    order by (v.end_date >= today) desc, v.end_date, v.created_at;
end;
$$;

create or replace function public.join_run_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  c public.run_challenges;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from public.run_challenges where id = p_id and active;
  if not found then raise exception 'not_found'; end if;
  if c.end_date < today then raise exception 'challenge_ended'; end if;
  if public.run_comment_blocked(uid) then raise exception 'blocked'; end if;
  insert into public.run_challenge_members (challenge_id, user_id)
  values (p_id, uid)
  on conflict do nothing;
end;
$$;

create or replace function public.leave_run_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.run_challenge_members where challenge_id = p_id and user_id = auth.uid();
end;
$$;

-- Ranking do desafio: só para quem entrou. Os 50 primeiros e, se eu estiver
-- fora deles, a minha linha no fim.
create or replace function public.run_challenge_ranking(p_id uuid)
returns table (rcr_name text, rcr_is_me boolean, rcr_value numeric, rcr_rank integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.run_challenges;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from public.run_challenges where id = p_id and active;
  if not found or not exists (select 1 from public.run_challenge_members m where m.challenge_id = p_id and m.user_id = uid) then
    raise exception 'not_found';
  end if;
  return query
    with scores as (
      select m.user_id, public.run_challenge_value(c.metric, m.user_id, c.start_date, c.end_date) as val
      from public.run_challenge_members m
      where m.challenge_id = p_id
    ),
    ranked as (
      select s.user_id, s.val, rank() over (order by s.val desc)::int as rk,
             row_number() over (order by s.val desc, public.friend_display_name(s.user_id))::int as pos
      from scores s
    )
    select public.friend_display_name(r.user_id), r.user_id = uid, r.val, r.rk
    from ranked r
    where r.pos <= 50 or r.user_id = uid
    order by r.pos;
end;
$$;

-- Painel: quem entrou e quanto fez (com e-mail, para tirar quem lançou corrida falsa).
create or replace function public.admin_run_challenge_report(p_id uuid)
returns table (arc_user uuid, arc_name text, arc_email text, arc_value numeric, arc_rank integer, arc_joined timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  c public.run_challenges;
begin
  if not admin_can('content'::text) then raise exception 'forbidden'; end if;
  select * into c from public.run_challenges where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return query
    with scores as (
      select m.user_id, m.joined_at, public.run_challenge_value(c.metric, m.user_id, c.start_date, c.end_date) as val
      from public.run_challenge_members m
      where m.challenge_id = p_id
    )
    select s.user_id, public.friend_display_name(s.user_id), u.email::text, s.val,
           rank() over (order by s.val desc)::int, s.joined_at
    from scores s
    join auth.users u on u.id = s.user_id
    order by s.val desc, s.joined_at;
end;
$$;

revoke all on function public.run_challenge_value(text, uuid, date, date) from public, anon, authenticated;
revoke all on function public.my_run_challenges() from public, anon;
revoke all on function public.join_run_challenge(uuid) from public, anon;
revoke all on function public.leave_run_challenge(uuid) from public, anon;
revoke all on function public.run_challenge_ranking(uuid) from public, anon;
revoke all on function public.admin_run_challenge_report(uuid) from public, anon;
grant execute on function public.my_run_challenges() to authenticated;
grant execute on function public.join_run_challenge(uuid) to authenticated;
grant execute on function public.leave_run_challenge(uuid) to authenticated;
grant execute on function public.run_challenge_ranking(uuid) to authenticated;
grant execute on function public.admin_run_challenge_report(uuid) to authenticated;
