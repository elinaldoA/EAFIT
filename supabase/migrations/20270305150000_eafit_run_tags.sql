-- EAFIT Run: marcar amigos que correram junto.
--
-- runs.tagged: ids dos amigos marcados na corrida (até 10). Um gatilho deixa ali só
-- amigos de quem é dono da corrida (e contas ativas), então marcar não expõe o
-- nome de quem não é amigo. run_taggable_friends lista os amigos que dá para
-- marcar e run_feed passa a devolver rf_tags (nomes dos marcados).
--
-- O app funciona antes e depois: sem a coluna, a corrida só não tem marcados.

alter table public.runs add column if not exists tagged uuid[] not null default '{}';
alter table public.runs drop constraint if exists runs_tagged_max;
alter table public.runs add constraint runs_tagged_max check (cardinality(tagged) <= 10);

create or replace function public.runs_keep_friend_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  new.tagged := coalesce(
    (select array_agg(t) from (
       select distinct t from unnest(new.tagged) t
       where t <> new.user_id and public.are_friends(new.user_id, t) and not public.is_deactivated(t)
       limit 10
     ) x),
    '{}');
  return new;
end;
$;

drop trigger if exists runs_keep_friend_tags on public.runs;
create trigger runs_keep_friend_tags
  before insert or update of tagged on public.runs
  for each row execute function public.runs_keep_friend_tags();

create or replace function public.run_taggable_friends()
returns table (tf_user uuid, tf_name text)
language sql
stable
security definer
set search_path = public
as $
  select o.other, public.friend_display_name(o.other)
  from (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as other
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ) o
  where not public.is_deactivated(o.other)
  order by 2;
$;

revoke all on function public.run_taggable_friends() from public, anon;
grant execute on function public.run_taggable_friends() to authenticated;

drop function if exists public.run_feed(int, timestamptz);
create function public.run_feed(p_limit int default 20, p_before timestamptz default null)
returns table (
  rf_id uuid, rf_name text, rf_is_me boolean, rf_started_at timestamptz, rf_run_date date,
  rf_duration_s integer, rf_distance_m integer, rf_route jsonb, rf_kind text, rf_title text,
  rf_visibility text, rf_kudos integer, rf_kudoed boolean, rf_comments integer, rf_weather jsonb,
  rf_splits jsonb, rf_km_elev jsonb, rf_elev_gain_m integer, rf_cadence integer,
  rf_hr jsonb, rf_shoe_name text, rf_tags text[]
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
              and (c.user_id = uid or not public.run_comment_blocked(c.user_id))),
           r.weather, r.splits, r.km_elev, r.elev_gain_m::int, r.cadence::int,
           r.hr, (select sh.name from public.run_shoes sh where sh.id = r.shoe_id),
           array(select public.friend_display_name(t) from unnest(r.tagged) t where not public.is_deactivated(t))
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

revoke all on function public.run_feed(int, timestamptz) from public, anon;
grant execute on function public.run_feed(int, timestamptz) to authenticated;
