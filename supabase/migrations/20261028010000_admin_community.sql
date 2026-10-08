-- Painel admin: comunidade (desafios + amigos/feed).
--
-- Desafios e feed têm RLS ligado e SEM policy (todo acesso passa por funções
-- security definer), então o painel também só chega neles por função — aqui
-- ficam as de admin: listar, ver placar, criar desafio oficial, apagar, moderar
-- o feed e bloquear alguém de publicar. As ações que mudam algo gravam no log
-- de auditoria dentro da própria função.
--
-- Em funções com RETURNS TABLE as colunas de saída viram variáveis plpgsql,
-- então as colunas de saída são prefixadas e toda coluna de tabela tem alias.

-- ---------------------------------------------------------------------------
-- Desafio oficial: criado pelo painel, sem dono e sem limite de participantes.
-- Quem recebe o código (por notificação, aviso no app…) entra como em qualquer
-- desafio. Não é apagado quando o último participante sai.
-- ---------------------------------------------------------------------------
alter table public.challenges
  add column if not exists is_official boolean not null default false;

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
  if not ch.is_official
     and (select count(*) from public.challenge_members m where m.challenge_id = ch.id) >= 20 then
    raise exception 'challenge_full';
  end if;

  insert into public.challenge_members (challenge_id, user_id) values (ch.id, uid);
  return ch.id;
end;
$$;

create or replace function public.leave_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.challenge_members m where m.challenge_id = p_id and m.user_id = auth.uid();
  if not exists (select 1 from public.challenge_members m where m.challenge_id = p_id) then
    delete from public.challenges c where c.id = p_id and not c.is_official;
  end if;
end;
$$;

-- Todos os desafios (até 200, mais recentes primeiro). ac_active = participantes
-- que treinaram ao menos um dia dentro do período.
create or replace function public.admin_list_challenges()
returns table (
  ac_id uuid, ac_title text, ac_code text, ac_start date, ac_end date, ac_official boolean,
  ac_owner uuid, ac_owner_email text, ac_members bigint, ac_active bigint, ac_created timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with td as materialized (select t.user_id as uid, t.day as d from public.training_days() t)
    select c.id, c.title, c.invite_code, c.start_date, c.end_date, c.is_official,
           c.owner_id, u.email::text,
           (select count(*) from public.challenge_members m
             where m.challenge_id = c.id and m.role = 'member'),
           (select count(distinct m.user_id) from public.challenge_members m
              join td on td.uid = m.user_id and td.d between c.start_date and c.end_date
             where m.challenge_id = c.id and m.role = 'member'),
           c.created_at
    from public.challenges c
    left join auth.users u on u.id = c.owner_id
    order by c.end_date desc, c.created_at desc
    limit 200;
end;
$$;

-- Placar de um desafio, com e-mail (o do app mostra só o apelido).
create or replace function public.admin_challenge_leaderboard(p_id uuid)
returns table (al_user uuid, al_email text, al_name text, al_role text, al_score int)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select m.user_id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''),
                    nullif(btrim(u.raw_user_meta_data->>'nome'), ''),
                    split_part(u.email::text, '@', 1)),
           m.role,
           (select count(*)::int from public.training_days() t
             where t.user_id = m.user_id and t.day between c.start_date and c.end_date)
    from public.challenge_members m
    join public.challenges c on c.id = m.challenge_id
    join auth.users u on u.id = m.user_id
    where c.id = p_id
    order by 5 desc, 3;
end;
$$;

create or replace function public.admin_create_official_challenge(p_title text, p_start date, p_end date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  code text;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if length(v_title) not between 3 and 50 then raise exception 'invalid_title'; end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 60 then
    raise exception 'invalid_period';
  end if;

  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.challenges c where c.invite_code = code);
  end loop;

  insert into public.challenges (owner_id, title, invite_code, start_date, end_date, is_official)
  values (null, v_title, code, p_start, p_end, true);

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'createOfficialChallenge',
          jsonb_build_object('title', v_title, 'code', code, 'start', p_start, 'end', p_end));
  return code;
end;
$$;

create or replace function public.admin_delete_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  delete from public.challenges c where c.id = p_id returning c.title into v_title;
  if v_title is null then raise exception 'not_found'; end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'deleteChallenge', jsonb_build_object('title', v_title));
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed: bloqueio de publicação. Quem está bloqueado não publica e o que já
-- publicou some do feed dos amigos (a pessoa continua vendo o próprio). É
-- diferente de share_activity, que é escolha do usuário e ele pode religar.
-- ---------------------------------------------------------------------------
alter table public.friend_profiles
  add column if not exists feed_blocked boolean not null default false;

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
  if not (select fp.share_activity and not fp.feed_blocked
          from public.friend_profiles fp where fp.user_id = uid) then return; end if;

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
             and coalesce((select fp.share_activity and not fp.feed_blocked
                           from public.friend_profiles fp where fp.user_id = e.user_id), true)))
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Números gerais da parte social. Sem admins (contas de teste/operação).
create or replace function public.admin_social_stats()
returns table (
  ss_users bigint, ss_with_friends bigint, ss_friendships bigint, ss_pending bigint,
  ss_sharing_off bigint, ss_blocked bigint, ss_events_7d bigint, ss_events_30d bigint,
  ss_reactions_30d bigint, ss_challenges_active bigint, ss_challenge_users bigint
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
    with nonadmin as (
      select u.id as uid from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    acc as (
      select f.requester_id as a, f.addressee_id as b from public.friendships f where f.status = 'accepted'
    )
    select
      (select count(*) from nonadmin),
      (select count(*) from nonadmin n
        where exists (select 1 from acc where acc.a = n.uid or acc.b = n.uid)),
      (select count(*) from acc),
      (select count(*) from public.friendships f where f.status = 'pending'),
      (select count(*) from public.friend_profiles fp where not fp.share_activity),
      (select count(*) from public.friend_profiles fp where fp.feed_blocked),
      (select count(*) from public.feed_events e where e.created_at > now() - interval '7 days'),
      (select count(*) from public.feed_events e where e.created_at > now() - interval '30 days'),
      (select count(*) from public.feed_reactions r where r.created_at > now() - interval '30 days'),
      (select count(*) from public.challenges c where c.start_date <= today and c.end_date >= today),
      (select count(distinct m.user_id) from public.challenge_members m
         join public.challenges c on c.id = m.challenge_id
        where m.role = 'member' and c.start_date <= today and c.end_date >= today);
end;
$$;

-- Publicações do feed, da mais recente para a mais antiga.
create or replace function public.admin_feed_events(
  page_size int default 50,
  page_offset int default 0,
  only_kind text default null
)
returns table (
  fe_id bigint, fe_user uuid, fe_email text, fe_kind text, fe_title text, fe_detail text,
  fe_at timestamptz, fe_reactions bigint, fe_blocked boolean, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select e.id, e.user_id, u.email::text, e.kind, e.title, e.detail, e.created_at,
           (select count(*) from public.feed_reactions r where r.event_id = e.id),
           coalesce(fp.feed_blocked, false),
           count(*) over()::bigint
    from public.feed_events e
    join auth.users u on u.id = e.user_id
    left join public.friend_profiles fp on fp.user_id = e.user_id
    where only_kind is null or e.kind = only_kind
    order by e.created_at desc
    limit least(greatest(coalesce(page_size, 50), 1), 200) offset greatest(coalesce(page_offset, 0), 0);
end;
$$;

create or replace function public.admin_delete_feed_event(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_kind text;
  v_title text;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  delete from public.feed_events e where e.id = p_id
  returning e.user_id, e.kind, e.title into v_owner, v_kind, v_title;
  if v_owner is null then raise exception 'not_found'; end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), v_owner, 'deleteFeedEvent', jsonb_build_object('kind', v_kind, 'title', v_title));
end;
$$;

create or replace function public.admin_set_feed_block(p_user uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  perform public.ensure_friend_profile(p_user);
  update public.friend_profiles fp set feed_blocked = coalesce(p_blocked, false) where fp.user_id = p_user;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), p_user, case when p_blocked then 'blockFeed' else 'unblockFeed' end, null);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_list_challenges()', 'admin_challenge_leaderboard(uuid)',
    'admin_create_official_challenge(text, date, date)', 'admin_delete_challenge(uuid)',
    'admin_social_stats()', 'admin_feed_events(int, int, text)',
    'admin_delete_feed_event(bigint)', 'admin_set_feed_block(uuid, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
