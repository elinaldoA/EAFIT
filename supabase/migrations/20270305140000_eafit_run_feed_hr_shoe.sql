-- EAFIT Run: frequência cardíaca e tênis no feed.
--
-- run_feed passa a devolver rf_hr (runs.hr: { avg, max, z }) e rf_shoe_name (nome do
-- tênis da corrida, run_shoes.name) para o cartão dos stories de cada corrida do
-- feed mostrar a frequência média e o tênis. Segue a visibilidade de antes: as
-- minhas corridas e as de amigos com visibilidade 'amigos' (o mesmo que já vê o
-- percurso e o clima). Só o nome do tênis sai, nunca o desgaste ou o limite.
--
-- Recria a função (o retorno muda), partindo da versão com parciais e subida
-- (20270305130000). O app funciona antes e depois: sem as colunas o cartão só
-- fica sem a frequência e o tênis.

drop function if exists public.run_feed(int, timestamptz);
create function public.run_feed(p_limit int default 20, p_before timestamptz default null)
returns table (
  rf_id uuid, rf_name text, rf_is_me boolean, rf_started_at timestamptz, rf_run_date date,
  rf_duration_s integer, rf_distance_m integer, rf_route jsonb, rf_kind text, rf_title text,
  rf_visibility text, rf_kudos integer, rf_kudoed boolean, rf_comments integer, rf_weather jsonb,
  rf_splits jsonb, rf_km_elev jsonb, rf_elev_gain_m integer, rf_cadence integer,
  rf_hr jsonb, rf_shoe_name text
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
           r.hr, (select sh.name from public.run_shoes sh where sh.id = r.shoe_id)
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
