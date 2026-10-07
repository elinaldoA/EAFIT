-- Amigos + feed de atividade com reações.
--
-- Amigos: cada pessoa tem um código próprio (friend_profiles.friend_code). Quem
-- digita o código de outra pessoa envia um pedido; só vira amizade quando o
-- outro lado aceita. Se os dois se pedirem, aceita na hora.
--
-- Feed: eventos curtos (treino concluído, novo recorde, sequência) que o app
-- publica por post_activity(). Só os amigos aceitos veem, e só de quem não
-- desligou o compartilhamento (friend_profiles.share_activity). Reações: 💪 🔥 👏.
--
-- Privacidade (mesmo modelo dos desafios): RLS ligado e SEM policy — todo acesso
-- passa pelas funções abaixo (security definer), que expõem só apelido/primeiro
-- nome e o conteúdo dos eventos, nunca e-mail nem id de usuário.

create table if not exists public.friend_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  friend_code text not null unique,
  share_activity boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- Um único vínculo por par, qualquer que seja o lado que pediu.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

create table if not exists public.feed_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('treino', 'recorde', 'sequencia')),
  title text not null check (length(btrim(title)) between 1 and 80),
  detail text check (detail is null or length(detail) <= 140),
  created_at timestamptz not null default now()
);

create index if not exists feed_events_user_idx on public.feed_events (user_id, created_at desc);

create table if not exists public.feed_reactions (
  event_id bigint not null references public.feed_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('💪', '🔥', '👏')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists feed_reactions_user_idx on public.feed_reactions (user_id);

alter table public.friend_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.feed_events enable row level security;
alter table public.feed_reactions enable row level security;

-- ---------------------------------------------------------------------------
-- Auxiliares (não expostas ao app).
-- ---------------------------------------------------------------------------
create or replace function public.friend_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''),
                  nullif(split_part(btrim(coalesce(u.raw_user_meta_data->>'nome', '')), ' ', 1), ''),
                  'Atleta')
  from auth.users u where u.id = p_user;
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- Garante a linha de perfil social (cria com código novo, compartilhando ligado).
create or replace function public.ensure_friend_profile(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if exists (select 1 from public.friend_profiles fp where fp.user_id = p_user) then return; end if;
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.friend_profiles fp where fp.friend_code = code);
  end loop;
  insert into public.friend_profiles (user_id, friend_code) values (p_user, code)
  on conflict (user_id) do nothing;
end;
$$;

revoke execute on function public.friend_display_name(uuid) from public, anon, authenticated;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ensure_friend_profile(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Meu perfil social: código e preferência de compartilhar atividade.
-- ---------------------------------------------------------------------------
create or replace function public.my_friend_profile()
returns table (fp_code text, fp_share boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.ensure_friend_profile(auth.uid());
  return query select p.friend_code, p.share_activity from public.friend_profiles p where p.user_id = auth.uid();
end;
$$;

create or replace function public.set_share_activity(p_share boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.ensure_friend_profile(auth.uid());
  update public.friend_profiles set share_activity = p_share where user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedir amizade pelo código. Retorna 'sent', 'accepted' (o outro já tinha
-- pedido) ou 'already' (já são amigos / pedido já enviado).
-- ---------------------------------------------------------------------------
create or replace function public.request_friend(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target uuid;
  fr public.friendships%rowtype;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select p.user_id into target from public.friend_profiles p
  where p.friend_code = upper(btrim(p_code));
  if target is null then raise exception 'invalid_code'; end if;
  if target = uid then raise exception 'self_code'; end if;

  select * into fr from public.friendships f
  where (f.requester_id = uid and f.addressee_id = target)
     or (f.requester_id = target and f.addressee_id = uid);

  if found then
    if fr.status = 'accepted' then return 'already'; end if;
    if fr.requester_id = target then
      update public.friendships set status = 'accepted' where id = fr.id;
      return 'accepted';
    end if;
    return 'already';
  end if;

  if (select count(*) from public.friendships f
      where f.requester_id = uid and f.status = 'pending') >= 20 then
    raise exception 'too_many_requests';
  end if;
  if (select count(*) from public.friendships f
      where f.status = 'accepted' and (f.requester_id = uid or f.addressee_id = uid)) >= 100 then
    raise exception 'too_many_friends';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (uid, target);
  return 'sent';
end;
$$;

-- Aceitar ou recusar um pedido recebido.
create or replace function public.respond_friend(p_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted'
    where id = p_id and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
    where id = p_id and addressee_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Desfazer amizade ou cancelar/recusar pedido (qualquer um dos lados).
create or replace function public.remove_friendship(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.friendships
  where id = p_id and (requester_id = auth.uid() or addressee_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Amigos e pedidos. fr_week = dias treinados nos últimos 7 dias (ranking
-- semanal), null para quem desligou o compartilhamento. Pedidos pendentes não
-- mostram atividade.
-- ---------------------------------------------------------------------------
create or replace function public.my_friends()
returns table (fr_id bigint, fr_name text, fr_status text, fr_week int)
language sql
stable
security definer
set search_path = public
as $$
  with rel as (
    select f.id,
           case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as other,
           case when f.status = 'accepted' then 'friend'
                when f.requester_id = auth.uid() then 'outgoing'
                else 'incoming' end as st,
           f.created_at
    from public.friendships f
    where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  ),
  week as (
    select td.user_id, count(*)::int as n
    from public.training_days() td
    where td.day > (now() at time zone 'America/Sao_Paulo')::date - 7
      and td.user_id in (select other from rel where st = 'friend')
    group by td.user_id
  )
  select rel.id,
         public.friend_display_name(rel.other),
         rel.st,
         case when rel.st = 'friend' and coalesce(fp.share_activity, true)
              then coalesce(week.n, 0) end
  from rel
  left join public.friend_profiles fp on fp.user_id = rel.other
  left join week on week.user_id = rel.other
  order by (rel.st = 'incoming') desc, (rel.st = 'friend') desc, rel.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Publicar atividade. Sem efeito se a pessoa desligou o compartilhamento.
-- Limites: 1 'treino' por dia, 'recorde' repetido no dia ignorado, 20/dia.
-- Em 'treino', publica também 'sequencia' quando os dias seguidos batem um
-- marco (conta só dias treinados seguidos, sem considerar o modo pausa).
-- ---------------------------------------------------------------------------
create or replace function public.post_activity(p_kind text, p_title text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  day_start timestamptz := (today::timestamp at time zone 'America/Sao_Paulo');
  v_title text := left(btrim(coalesce(p_title, '')), 80);
  v_detail text := nullif(left(btrim(coalesce(p_detail, '')), 140), '');
  streak int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('treino', 'recorde', 'sequencia') or v_title = '' then return; end if;

  perform public.ensure_friend_profile(uid);
  if not (select fp.share_activity from public.friend_profiles fp where fp.user_id = uid) then return; end if;

  if (select count(*) from public.feed_events e where e.user_id = uid and e.created_at >= day_start) >= 20 then return; end if;
  if exists (
    select 1 from public.feed_events e
    where e.user_id = uid and e.created_at >= day_start and e.kind = p_kind
      and (p_kind = 'treino' or e.title = v_title)
  ) then return; end if;

  insert into public.feed_events (user_id, kind, title, detail) values (uid, p_kind, v_title, v_detail);

  if p_kind = 'treino' then
    select count(*) into streak from (
      select d.day, row_number() over (order by d.day desc) as rn
      from (select today as day
            union
            select td.day from public.training_days() td
            where td.user_id = uid and td.day < today and td.day >= today - 120) d
    ) s
    where s.day = today - (s.rn - 1)::int;
    if streak in (3, 7, 14, 21, 30, 50, 100)
       and not exists (select 1 from public.feed_events e
                       where e.user_id = uid and e.created_at >= day_start and e.kind = 'sequencia') then
      insert into public.feed_events (user_id, kind, title, detail)
      values (uid, 'sequencia', streak || ' dias seguidos', 'Sequência de treinos');
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed: meus eventos + dos amigos aceitos que compartilham, últimos 30 dias.
-- ---------------------------------------------------------------------------
create or replace function public.friend_feed(p_limit int default 30)
returns table (
  fd_id bigint, fd_name text, fd_is_me boolean, fd_kind text, fd_title text,
  fd_detail text, fd_at timestamptz, fd_counts jsonb, fd_mine text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id,
         public.friend_display_name(e.user_id),
         e.user_id = auth.uid(),
         e.kind, e.title, e.detail, e.created_at,
         coalesce((select jsonb_object_agg(r.emoji, r.n)
                   from (select emoji, count(*)::int as n from public.feed_reactions fr
                         where fr.event_id = e.id group by emoji) r), '{}'::jsonb),
         (select fr.emoji from public.feed_reactions fr where fr.event_id = e.id and fr.user_id = auth.uid())
  from public.feed_events e
  where e.created_at > now() - interval '30 days'
    and (e.user_id = auth.uid()
         or (public.are_friends(auth.uid(), e.user_id)
             and coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = e.user_id), true)))
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Reagir (de novo com o mesmo emoji desfaz; outro emoji troca).
create or replace function public.react_to_event(p_event bigint, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_current text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_emoji not in ('💪', '🔥', '👏') then raise exception 'invalid_emoji'; end if;

  select e.user_id into v_owner from public.feed_events e where e.id = p_event;
  if v_owner is null then raise exception 'not_found'; end if;
  if v_owner <> uid and not (
       public.are_friends(uid, v_owner)
       and coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = v_owner), true)
     ) then
    raise exception 'not_authorized';
  end if;

  select r.emoji into v_current from public.feed_reactions r where r.event_id = p_event and r.user_id = uid;
  if v_current = p_emoji then
    delete from public.feed_reactions where event_id = p_event and user_id = uid;
  else
    insert into public.feed_reactions (event_id, user_id, emoji) values (p_event, uid, p_emoji)
    on conflict (event_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'my_friend_profile()', 'set_share_activity(boolean)', 'request_friend(text)',
    'respond_friend(bigint, boolean)', 'remove_friendship(bigint)', 'my_friends()',
    'post_activity(text, text, text)', 'friend_feed(int)', 'react_to_event(bigint, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
