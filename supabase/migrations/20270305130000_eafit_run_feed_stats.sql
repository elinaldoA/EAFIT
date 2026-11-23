-- EAFIT Run: parciais, subida e cadência no feed.
--
-- run_feed passa a devolver rf_splits, rf_km_elev, rf_elev_gain_m e rf_cadence
-- (runs.splits, runs.km_elev, runs.elev_gain_m, runs.cadence) para o cartão dos
-- stories de cada corrida do feed mostrar o gráfico de ritmo por km, a subida e
-- a cadência. São só números da corrida (sem posição além do percurso, que o feed
-- já devolvia); a visibilidade é a mesma de antes.
--
-- O retorno muda, então a função é recriada. O app funciona antes e depois desta
-- migration: sem as colunas novas o cartão só fica sem o gráfico.

drop function if exists public.run_feed(int, timestamptz);
create function public.run_feed(p_limit int default 20, p_before timestamptz default null)
returns table (
  rf_id uuid, rf_name text, rf_is_me boolean, rf_started_at timestamptz, rf_run_date date,
  rf_duration_s integer, rf_distance_m integer, rf_route jsonb, rf_kind text, rf_title text,
  rf_visibility text, rf_kudos integer, rf_kudoed boolean, rf_comments integer, rf_weather jsonb,
  rf_splits jsonb, rf_km_elev jsonb, rf_elev_gain_m integer, rf_cadence integer
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
           r.weather, r.splits, r.km_elev, r.elev_gain_m::int, r.cadence::int
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
