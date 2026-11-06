-- EAFIT Run: comentários nas corridas.
--
-- Quem comenta: quem pode ver a corrida (o dono e os amigos, run_visible_to),
-- desde que não esteja bloqueado no feed (friend_profiles.feed_blocked, a
-- mesma trava da moderação do feed de amigos). Comentário de quem foi
-- bloqueado some da lista para os outros.
-- Quem apaga: o autor ou o dono da corrida.
-- Denúncia: entra em feed_reports sem publicação (event_id null), com o texto
-- no snapshot; o painel (Comunidade → Moderação) já agrupa por pessoa.
-- Palavras bloqueadas (app_settings 'feed_blocked_words') recusam o comentário.
-- Limite: 30 comentários por hora por pessoa.
-- O dono recebe um aviso no app (user_notifications) a cada comentário de outra pessoa.

create table if not exists public.run_comments (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists run_comments_run_idx on public.run_comments (run_id, created_at);
create index if not exists run_comments_user_idx on public.run_comments (user_id, created_at desc);

-- Sem política: a tabela só é lida e escrita pelas funções (security definer).
alter table public.run_comments enable row level security;
revoke all on public.run_comments from anon, authenticated;

create or replace function public.run_comment_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select fp.feed_blocked from public.friend_profiles fp where fp.user_id = p_user), false);
$$;

-- Comentários de uma corrida que eu posso ver, do mais antigo ao mais novo.
create or replace function public.run_comments_list(p_run uuid)
returns table (rc_id bigint, rc_name text, rc_is_me boolean, rc_body text, rc_created_at timestamptz, rc_can_delete boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  r public.runs;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into r from public.runs where id = p_run;
  if not found or not public.run_visible_to(r, uid) then raise exception 'not_found'; end if;
  return query
    select c.id, public.friend_display_name(c.user_id), c.user_id = uid, c.body, c.created_at,
           c.user_id = uid or r.user_id = uid
    from public.run_comments c
    where c.run_id = p_run
      and (c.user_id = uid or not public.run_comment_blocked(c.user_id))
    order by c.created_at
    limit 200;
end;
$$;

create or replace function public.add_run_comment(p_run uuid, p_body text)
returns table (rc_id bigint, rc_name text, rc_is_me boolean, rc_body text, rc_created_at timestamptz, rc_can_delete boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  r public.runs;
  txt text := btrim(coalesce(p_body, ''));
  words text[];
  new_id bigint;
  who text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into r from public.runs where id = p_run;
  if not found or not public.run_visible_to(r, uid) then raise exception 'not_found'; end if;
  if char_length(txt) < 1 or char_length(txt) > 280 then raise exception 'invalid_body'; end if;
  if public.run_comment_blocked(uid) then raise exception 'blocked'; end if;
  if (select count(*) from public.run_comments c where c.user_id = uid and c.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited';
  end if;
  select array(select lower(btrim(w)) from jsonb_array_elements_text(coalesce(value->'words', '[]'::jsonb)) w where btrim(w) <> '')
    into words from public.app_settings where key = 'feed_blocked_words';
  if words is not null and exists (select 1 from unnest(words) w where lower(txt) like '%' || w || '%') then
    raise exception 'blocked_word';
  end if;

  insert into public.run_comments (run_id, user_id, body) values (p_run, uid, txt) returning id into new_id;
  who := public.friend_display_name(uid);

  if r.user_id <> uid then
    insert into public.user_notifications (user_id, kind, title, body)
    values (r.user_id, 'aviso', '💬 ' || coalesce(nullif(who, ''), 'Um amigo') || ' comentou na sua corrida',
            left(coalesce(nullif(btrim(r.title), ''), 'Corrida') || ': ' || txt, 300));
  end if;

  return query select new_id, who, true, txt, now(), true;
end;
$$;

create or replace function public.delete_run_comment(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  delete from public.run_comments c
   where c.id = p_id
     and (c.user_id = uid or exists (select 1 from public.runs r where r.id = c.run_id and r.user_id = uid));
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- Denunciar o comentário de outra pessoa numa corrida que eu vejo.
create or replace function public.report_run_comment(p_id bigint, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  c public.run_comments;
  r public.runs;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_reason not in ('ofensivo', 'spam', 'falso', 'outro') then raise exception 'invalid_reason'; end if;
  select * into c from public.run_comments where id = p_id;
  if not found or c.user_id = uid then raise exception 'not_found'; end if;
  select * into r from public.runs where id = c.run_id;
  if not found or not public.run_visible_to(r, uid) then raise exception 'not_found'; end if;
  if exists (
    select 1 from public.feed_reports fr
    where fr.reporter = uid and fr.event_id is null and fr.reported_user = c.user_id
      and fr.snapshot like '[comentário #' || c.id || ']%'
  ) then
    return;
  end if;
  insert into public.feed_reports (event_id, reported_user, reporter, reason, note, snapshot)
  values (null, c.user_id, uid, p_reason, nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          left('[comentário #' || c.id || '] ' || public.friend_display_name(c.user_id) || ': ' || c.body, 300));
end;
$$;

-- Backup (lib/exportData.js): os comentários que eu escrevi.
create or replace function public.my_run_comments()
returns table (mc_run uuid, mc_body text, mc_created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.run_id, c.body, c.created_at from public.run_comments c
  where c.user_id = auth.uid()
  order by c.created_at;
$$;

-- Feed com a contagem de comentários (o retorno muda, então a função é recriada).
drop function if exists public.run_feed(int, timestamptz);
create function public.run_feed(p_limit int default 20, p_before timestamptz default null)
returns table (
  rf_id uuid, rf_name text, rf_is_me boolean, rf_started_at timestamptz, rf_run_date date,
  rf_duration_s integer, rf_distance_m integer, rf_route jsonb, rf_kind text, rf_title text,
  rf_visibility text, rf_kudos integer, rf_kudoed boolean, rf_comments integer
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
    select r.id, public.friend_display_name(r.user_id), r.user_id = uid, r.started_at, r.run_date,
           r.duration_s, r.distance_m, r.route, r.kind, r.title, r.visibility,
           (select count(*)::int from public.run_kudos k where k.run_id = r.id),
           exists (select 1 from public.run_kudos k where k.run_id = r.id and k.user_id = uid),
           (select count(*)::int from public.run_comments c where c.run_id = r.id
              and (c.user_id = uid or not public.run_comment_blocked(c.user_id)))
    from public.runs r
    where (p_before is null or r.started_at < p_before)
      and (r.user_id = uid
           or (r.visibility = 'amigos'
               and public.are_friends(uid, r.user_id)
               and coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = r.user_id), true)))
    order by r.started_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.run_comment_blocked(uuid) from public, anon, authenticated;
revoke all on function public.run_comments_list(uuid) from public, anon;
revoke all on function public.add_run_comment(uuid, text) from public, anon;
revoke all on function public.delete_run_comment(bigint) from public, anon;
revoke all on function public.report_run_comment(bigint, text, text) from public, anon;
revoke all on function public.run_feed(int, timestamptz) from public, anon;
revoke all on function public.my_run_comments() from public, anon;
grant execute on function public.my_run_comments() to authenticated;
grant execute on function public.run_comments_list(uuid) to authenticated;
grant execute on function public.add_run_comment(uuid, text) to authenticated;
grant execute on function public.delete_run_comment(bigint) to authenticated;
grant execute on function public.report_run_comment(bigint, text, text) to authenticated;
grant execute on function public.run_feed(int, timestamptz) to authenticated;
