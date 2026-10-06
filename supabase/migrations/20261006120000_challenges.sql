-- Desafios com amigos por código de convite. Quem cria define título e período;
-- quem recebe o código entra. O placar é de dias treinados no período (mesma
-- definição de "treinou" do resto do sistema: training_days()).
--
-- Privacidade: as tabelas ficam com RLS ligado e SEM policy — todo acesso passa
-- pelas funções abaixo (security definer), que só mostram o placar a quem é
-- membro e expõem apenas apelido/primeiro nome e pontuação, nunca e-mail ou id.
-- As funções são `language sql` com colunas de saída prefixadas (ch_*, lb_*)
-- pra não haver conflito de nome com colunas das tabelas.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null check (length(btrim(title)) between 3 and 50),
  invite_code text not null unique,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 60)
);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenge_members_user_idx on public.challenge_members (user_id);

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;

-- ---------------------------------------------------------------------------
-- Criar: o criador já entra como membro. Máx. 5 desafios criados ainda em
-- andamento por usuário (contra spam).
-- ---------------------------------------------------------------------------
create or replace function public.create_challenge(p_title text, p_start date, p_end date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  code text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if (select count(*) from public.challenges c
      where c.owner_id = uid and c.end_date >= (now() at time zone 'America/Sao_Paulo')::date) >= 5 then
    raise exception 'too_many_challenges';
  end if;

  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.challenges c where c.invite_code = code);
  end loop;

  insert into public.challenges (owner_id, title, invite_code, start_date, end_date)
  values (uid, btrim(p_title), code, p_start, p_end)
  returning id into new_id;

  insert into public.challenge_members (challenge_id, user_id) values (new_id, uid);
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entrar pelo código. Máx. 20 participantes; desafio encerrado não aceita.
-- ---------------------------------------------------------------------------
create or replace function public.join_challenge(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ch public.challenges%rowtype;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into ch from public.challenges c where c.invite_code = upper(btrim(p_code));
  if not found then raise exception 'invalid_code'; end if;
  if ch.end_date < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'challenge_ended'; end if;

  if exists (select 1 from public.challenge_members m where m.challenge_id = ch.id and m.user_id = uid) then
    return ch.id;
  end if;
  if (select count(*) from public.challenge_members m where m.challenge_id = ch.id) >= 20 then
    raise exception 'challenge_full';
  end if;

  insert into public.challenge_members (challenge_id, user_id) values (ch.id, uid);
  return ch.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sair. Quando o último membro sai, o desafio é apagado.
-- ---------------------------------------------------------------------------
create or replace function public.leave_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.challenge_members m where m.challenge_id = p_id and m.user_id = auth.uid();
  if not exists (select 1 from public.challenge_members m where m.challenge_id = p_id) then
    delete from public.challenges c where c.id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Meus desafios (em andamento, futuros e encerrados há até 14 dias), com
-- minha pontuação e posição.
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
    group by cm.challenge_id, cm.user_id
  ),
  ranked as (
    select s.challenge_id, s.user_id, s.score,
           rank() over (partition by s.challenge_id order by s.score desc)::int as rk,
           count(*) over (partition by s.challenge_id) as members
    from scores s
  )
  select mine.id, mine.title, mine.invite_code, mine.start_date, mine.end_date,
         r.members, r.score, r.rk
  from mine
  join ranked r on r.challenge_id = mine.id and r.user_id = auth.uid()
  order by mine.end_date >= (now() at time zone 'America/Sao_Paulo')::date desc, mine.end_date;
$$;

-- ---------------------------------------------------------------------------
-- Placar de um desafio: só para membros.
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

revoke execute on function public.create_challenge(text, date, date) from public, anon;
revoke execute on function public.join_challenge(text) from public, anon;
revoke execute on function public.leave_challenge(uuid) from public, anon;
revoke execute on function public.my_challenges() from public, anon;
revoke execute on function public.challenge_leaderboard(uuid) from public, anon;
grant execute on function public.create_challenge(text, date, date) to authenticated;
grant execute on function public.join_challenge(text) to authenticated;
grant execute on function public.leave_challenge(uuid) to authenticated;
grant execute on function public.my_challenges() to authenticated;
grant execute on function public.challenge_leaderboard(uuid) to authenticated;
