-- EAFIT Run: clubes de corrida.
--
-- Um clube é um grupo com código de convite. Quem entra vê o ranking de km do
-- clube (semana ou mês) e os nomes dos membros — nada além disso: as corridas
-- em si continuam só para os amigos (run_visible_to).
-- No ranking entram só corridas não privadas ('amigos') de quem não desligou o
-- compartilhamento de atividade (friend_profiles.share_activity).
-- Limites: 5 clubes por pessoa, 100 membros por clube, 3 clubes criados por dia.
-- Quem criou é o dono; se sair, o clube passa para o membro mais antigo (ou
-- some, se estava sozinho). Apagar a conta do dono apaga o clube (cascade).
-- Nome e descrição passam pelas palavras bloqueadas (app_settings 'feed_blocked_words').
-- As tabelas são fechadas: tudo passa pelas funções abaixo (security definer).

create table if not exists public.run_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 40),
  description text check (description is null or char_length(description) <= 200),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now()
);
create index if not exists run_clubs_owner_idx on public.run_clubs (owner_id, created_at desc);

create table if not exists public.run_club_members (
  club_id uuid not null references public.run_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists run_club_members_user_idx on public.run_club_members (user_id);

alter table public.run_clubs enable row level security;
alter table public.run_club_members enable row level security;
revoke all on public.run_clubs from anon, authenticated;
revoke all on public.run_club_members from anon, authenticated;

create or replace function public.run_club_text_blocked(p_text text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_settings s,
         lateral jsonb_array_elements_text(coalesce(s.value->'words', '[]'::jsonb)) w
    where s.key = 'feed_blocked_words'
      and btrim(w) <> ''
      and lower(coalesce(p_text, '')) like '%' || lower(btrim(w)) || '%'
  );
$$;

create or replace function public.run_club_new_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.run_clubs where code = c);
  end loop;
  return c;
end;
$$;

-- Meus clubes: com número de membros, se sou o dono e o código de convite.
create or replace function public.my_run_clubs()
returns table (rc_id uuid, rc_name text, rc_description text, rc_is_owner boolean, rc_code text, rc_members integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.description, c.owner_id = auth.uid(), c.code,
         (select count(*)::int from public.run_club_members m2 where m2.club_id = c.id)
  from public.run_club_members m
  join public.run_clubs c on c.id = m.club_id
  where m.user_id = auth.uid()
  order by m.joined_at;
$$;

create or replace function public.create_run_club(p_name text, p_description text default null)
returns table (rc_id uuid, rc_name text, rc_description text, rc_is_owner boolean, rc_code text, rc_members integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  nm text := btrim(coalesce(p_name, ''));
  ds text := nullif(btrim(coalesce(p_description, '')), '');
  new_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(nm) < 3 or char_length(nm) > 40 or char_length(coalesce(ds, '')) > 200 then
    raise exception 'invalid_name';
  end if;
  if public.run_club_text_blocked(nm) or public.run_club_text_blocked(ds) then raise exception 'blocked_word'; end if;
  if public.run_comment_blocked(uid) then raise exception 'blocked'; end if;
  if (select count(*) from public.run_club_members m where m.user_id = uid) >= 5 then raise exception 'too_many_clubs'; end if;
  if (select count(*) from public.run_clubs c where c.owner_id = uid and c.created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited';
  end if;

  insert into public.run_clubs (name, description, owner_id, code)
  values (nm, ds, uid, public.run_club_new_code())
  returning id into new_id;
  insert into public.run_club_members (club_id, user_id) values (new_id, uid);

  return query select * from public.my_run_clubs() x where x.rc_id = new_id;
end;
$$;

-- Entra pelo código. Devolve o clube; entrar de novo no mesmo não faz nada.
create or replace function public.join_run_club(p_code text)
returns table (rc_id uuid, rc_name text, rc_description text, rc_is_owner boolean, rc_code text, rc_members integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.run_clubs;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from public.run_clubs where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'invalid_code'; end if;
  if public.run_comment_blocked(uid) then raise exception 'blocked'; end if;
  if not exists (select 1 from public.run_club_members m where m.club_id = c.id and m.user_id = uid) then
    if (select count(*) from public.run_club_members m where m.user_id = uid) >= 5 then raise exception 'too_many_clubs'; end if;
    if (select count(*) from public.run_club_members m where m.club_id = c.id) >= 100 then raise exception 'club_full'; end if;
    insert into public.run_club_members (club_id, user_id) values (c.id, uid);
  end if;
  return query select * from public.my_run_clubs() x where x.rc_id = c.id;
end;
$$;

-- Sai do clube. O dono que sai passa o clube ao membro mais antigo; sozinho, o clube some.
create or replace function public.leave_run_club(p_club uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.run_clubs;
  heir uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from public.run_clubs where id = p_club;
  if not found or not exists (select 1 from public.run_club_members m where m.club_id = p_club and m.user_id = uid) then
    raise exception 'not_found';
  end if;
  delete from public.run_club_members m where m.club_id = p_club and m.user_id = uid;
  if c.owner_id = uid then
    select m.user_id into heir from public.run_club_members m where m.club_id = p_club order by m.joined_at limit 1;
    if heir is null then
      delete from public.run_clubs where id = p_club;
    else
      update public.run_clubs set owner_id = heir where id = p_club;
    end if;
  end if;
end;
$$;

-- O dono encerra o clube (os membros saem junto).
create or replace function public.delete_run_club(p_club uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.run_clubs where id = p_club and owner_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- Ranking de km do clube. p_period: 'week' (segunda a domingo) ou 'month'.
-- Só quem é do clube pode ver. Membros que ocultaram a atividade aparecem sem
-- números (cr_hidden), para o ranking não "sumir" com gente.
create or replace function public.run_club_ranking(p_club uuid, p_period text default 'week')
returns table (cr_name text, cr_is_me boolean, cr_meters bigint, cr_runs bigint, cr_hidden boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.run_club_members m where m.club_id = p_club and m.user_id = uid) then
    raise exception 'not_found';
  end if;
  since := case when p_period = 'month' then date_trunc('month', today)::date
                else today - ((extract(isodow from today)::int) - 1) end;
  return query
    select public.friend_display_name(m.user_id), m.user_id = uid,
           case when m.hidden then 0 else coalesce(sum(r.distance_m), 0)::bigint end,
           case when m.hidden then 0 else count(r.id)::bigint end,
           m.hidden
    from (
      select m0.user_id,
             m0.user_id <> uid
               and not coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = m0.user_id), true) as hidden
      from public.run_club_members m0 where m0.club_id = p_club
    ) m
    left join public.runs r on r.user_id = m.user_id and not m.hidden
      and r.run_date >= since and r.run_date <= today
      and (m.user_id = uid or r.visibility = 'amigos')
    group by m.user_id, m.hidden
    order by 5 asc, 3 desc, 2 desc;
end;
$$;

revoke all on function public.run_club_text_blocked(text) from public, anon, authenticated;
revoke all on function public.run_club_new_code() from public, anon, authenticated;
revoke all on function public.my_run_clubs() from public, anon;
revoke all on function public.create_run_club(text, text) from public, anon;
revoke all on function public.join_run_club(text) from public, anon;
revoke all on function public.leave_run_club(uuid) from public, anon;
revoke all on function public.delete_run_club(uuid) from public, anon;
revoke all on function public.run_club_ranking(uuid, text) from public, anon;
grant execute on function public.my_run_clubs() to authenticated;
grant execute on function public.create_run_club(text, text) to authenticated;
grant execute on function public.join_run_club(text) to authenticated;
grant execute on function public.leave_run_club(uuid) to authenticated;
grant execute on function public.delete_run_club(uuid) to authenticated;
grant execute on function public.run_club_ranking(uuid, text) to authenticated;
