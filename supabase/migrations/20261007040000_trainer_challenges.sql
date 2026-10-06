-- Desafios para a turma do personal. O personal cria o desafio e os alunos
-- ativos entram automaticamente; ele participa como "coach": vê o placar mas
-- não é ranqueado nem entra na contagem de participantes.
--
-- challenge_members.role: 'member' (padrão, participa do placar) ou 'coach'.
-- my_challenges e challenge_leaderboard são recriadas (mesmas colunas de
-- saída) pra ignorar o coach no ranking; o coach continua vendo o desafio e o
-- placar porque tem linha em challenge_members.

alter table public.challenge_members
  add column if not exists role text not null default 'member' check (role in ('member', 'coach'));

-- ---------------------------------------------------------------------------
-- Meus desafios: agora o coach aparece (sem pontuação nem posição).
-- ---------------------------------------------------------------------------
create or replace function public.my_challenges()
returns table (
  ch_id uuid,
  ch_title text,
  ch_code text,
  ch_start date,
  ch_end date,
  ch_members bigint,
  ch_score int,
  ch_rank int
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.title, c.invite_code, c.start_date, c.end_date
    from public.challenges c
    join public.challenge_members m on m.challenge_id = c.id
    where m.user_id = auth.uid()
      and c.end_date >= (now() at time zone 'America/Sao_Paulo')::date - 14
  ),
  scores as (
    select cm.challenge_id, cm.user_id, count(td.day)::int as score
    from public.challenge_members cm
    join mine on mine.id = cm.challenge_id
    left join public.training_days() td
      on td.user_id = cm.user_id and td.day between mine.start_date and mine.end_date
    where cm.role = 'member'
    group by cm.challenge_id, cm.user_id
  ),
  ranked as (
    select s.challenge_id, s.user_id, s.score,
           rank() over (partition by s.challenge_id order by s.score desc)::int as rk
    from scores s
  )
  select mine.id, mine.title, mine.invite_code, mine.start_date, mine.end_date,
         (select count(*) from public.challenge_members x where x.challenge_id = mine.id and x.role = 'member'),
         r.score, r.rk
  from mine
  left join ranked r on r.challenge_id = mine.id and r.user_id = auth.uid()
  order by mine.end_date >= (now() at time zone 'America/Sao_Paulo')::date desc, mine.end_date;
$$;

-- ---------------------------------------------------------------------------
-- Placar: só membros (inclui o coach), ranqueando apenas role = 'member'.
-- ---------------------------------------------------------------------------
create or replace function public.challenge_leaderboard(p_id uuid)
returns table (lb_name text, lb_score int, lb_rank int, lb_is_me boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  with ch as (
    select c.id, c.start_date, c.end_date
    from public.challenges c
    where c.id = p_id
      and exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = auth.uid())
  ),
  scores as (
    select cm.user_id, count(td.day)::int as score
    from public.challenge_members cm
    join ch on ch.id = cm.challenge_id
    left join public.training_days() td
      on td.user_id = cm.user_id and td.day between ch.start_date and ch.end_date
    where cm.role = 'member'
    group by cm.user_id
  )
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''),
                  nullif(split_part(btrim(coalesce(u.raw_user_meta_data->>'nome', '')), ' ', 1), ''),
                  'Atleta'),
         s.score,
         rank() over (order by s.score desc)::int,
         s.user_id = auth.uid()
  from scores s
  join auth.users u on u.id = s.user_id
  order by 3, 1;
$$;

-- ---------------------------------------------------------------------------
-- Personal: cria o desafio e coloca os alunos ativos (todos, ou os pedidos).
-- Máx. 50 alunos por desafio e 10 desafios da turma em andamento.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_create_challenge(
  p_title text,
  p_start date,
  p_end date,
  p_clients uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_targets uuid[];
  new_id uuid;
  code text;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  select array_agg(c.client_id) into v_targets
  from public.trainer_clients c
  where c.trainer_id = uid and c.status = 'active'
    and (p_clients is null or c.client_id = any(p_clients));
  if v_targets is null then raise exception 'no_recipients'; end if;
  if array_length(v_targets, 1) > 50 then raise exception 'challenge_full'; end if;

  if (select count(*) from public.challenges c
      where c.owner_id = uid and c.end_date >= (now() at time zone 'America/Sao_Paulo')::date) >= 10 then
    raise exception 'too_many_challenges';
  end if;

  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.challenges c where c.invite_code = code);
  end loop;

  insert into public.challenges (owner_id, title, invite_code, start_date, end_date)
  values (uid, btrim(p_title), code, p_start, p_end)
  returning id into new_id;

  insert into public.challenge_members (challenge_id, user_id, role) values (new_id, uid, 'coach');
  insert into public.challenge_members (challenge_id, user_id, role)
  select new_id, t, 'member' from unnest(v_targets) t;

  return new_id;
end;
$$;

-- Personal encerra (apaga) um desafio que ele criou.
create or replace function public.trainer_delete_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  delete from public.challenges c where c.id = p_id and c.owner_id = auth.uid();
end;
$$;

revoke execute on function public.trainer_create_challenge(text, date, date, uuid[]) from public, anon;
revoke execute on function public.trainer_delete_challenge(uuid) from public, anon;
grant execute on function public.trainer_create_challenge(text, date, date, uuid[]) to authenticated;
grant execute on function public.trainer_delete_challenge(uuid) to authenticated;
