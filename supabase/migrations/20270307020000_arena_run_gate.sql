-- EAFIT Arena: o lado Run só vale quando o módulo Run está liberado
-- (app_settings 'modules' {enabled: [..., 'corrida']}, o mesmo que o job
-- liberar-modulo-corrida liga em 2026-12-01). Enquanto não estiver liberado:
--   * corrida não rende XP (nem a de quem testa o módulo antes do lançamento),
--     para todo mundo largar parelho no dia da liberação;
--   * missões de corrida e híbridas (Gym + Run) ficam fora da lista e não
--     podem ser resgatadas;
--   * arena_my avisa run_released=false e o app esconde o cartão no Run.
-- A Arena do Gym não muda. Ao liberar o módulo tudo passa a valer na hora,
-- sem nova migration: o portão lê a configuração a cada chamada.
-- Missão é "de corrida" se o módulo dela é 'run' ou se alguma meta usa runs/run_km.

create or replace function public.arena_run_released()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value->'enabled' from public.app_settings where key = 'modules'), '[]'::jsonb) ? 'corrida';
$$;

create or replace function public.arena_mission_uses_run(p_module text, p_goals jsonb)
returns boolean
language sql
immutable
as $$
  select p_module = 'run' or p_goals ?| array['runs', 'run_km'];
$$;

revoke execute on function public.arena_run_released() from public, anon, authenticated;
revoke execute on function public.arena_mission_uses_run(text, jsonb) from public, anon, authenticated;

-- Corrida só rende XP com o módulo liberado.
create or replace function public.arena_on_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := public.arena_cfg()->'run';
  xp int;
begin
  begin
    if not public.arena_run_released() then return new; end if;
    if new.distance_m >= coalesce((r->>'min_m')::int, 500)
       and new.duration_s >= coalesce((r->>'min_s')::int, 120)
       and new.distance_m::numeric / new.duration_s <= coalesce((r->>'max_speed_ms')::numeric, 8.3) then
      xp := coalesce((r->>'base')::int, 20)
          + least((new.distance_m / 1000) * coalesce((r->>'per_km')::int, 10), coalesce((r->>'max_km_xp')::int, 150))
          + case when new.gps then coalesce((r->>'gps_bonus')::int, 10) else 0 end;
      perform public.arena_award(new.user_id, 'run', new.id::text, 'run', xp, new.run_date);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace function public.arena_claim_mission(p_mission text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.arena_missions%rowtype;
  p_from date;
  p_to date;
  ok boolean;
  given int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not coalesce((public.arena_cfg()->>'enabled')::boolean, false) then raise exception 'arena_disabled'; end if;

  select * into m from public.arena_missions where id = p_mission and active;
  if not found then raise exception 'mission_not_found'; end if;
  if public.arena_mission_uses_run(m.module, m.goals) and not public.arena_run_released() then
    raise exception 'mission_not_found';
  end if;

  p_from := public.arena_period_start(m.period);
  p_to := public.arena_period_end(m.period);

  select coalesce(bool_and(public.arena_metric(uid, g.key, p_from, p_to) >= g.value::numeric), false)
    into ok from jsonb_each_text(m.goals) g;
  if not ok then raise exception 'mission_not_done'; end if;

  insert into public.arena_mission_claims (user_id, mission_id, period_start, xp)
  values (uid, m.id, p_from, m.xp)
  on conflict do nothing;
  if not found then raise exception 'mission_already_claimed'; end if;

  given := public.arena_award(uid, 'mission', m.id || ':' || p_from::text, 'any', m.xp, public.arena_today());
  return jsonb_build_object('xp', given);
end;
$$;

create or replace function public.arena_my()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := public.arena_cfg();
  today date := public.arena_today();
  prof public.arena_profiles%rowtype;
  cap int := coalesce((cfg->>'daily_cap')::int, 300);
  run_ok boolean := public.arena_run_released();
  used int;
begin
  if uid is null then return null; end if;
  if not coalesce((cfg->>'enabled')::boolean, false) then
    return jsonb_build_object('enabled', false);
  end if;

  select * into prof from public.arena_profiles where user_id = uid;
  select coalesce(sum(xp), 0) into used from public.arena_xp_events
    where user_id = uid and day = today and source in ('workout', 'run');

  return jsonb_build_object(
    'enabled', true,
    'run_released', run_ok,
    'xp', coalesce(prof.xp_total, 0),
    'level', coalesce(prof.level, 1),
    'level_from', 50 * (coalesce(prof.level, 1) - 1) ^ 2,
    'level_to', 50 * coalesce(prof.level, 1) ^ 2,
    'streak', case when prof.last_day >= today - 1 then coalesce(prof.streak, 0) else 0 end,
    'best_streak', coalesce(prof.best_streak, 0),
    'today_xp', used,
    'daily_cap', cap,
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'description', m.description, 'period', m.period,
        'module', m.module, 'xp', m.xp,
        'ends_on', public.arena_period_end(m.period),
        'progress', pr.progress,
        'done', pr.done,
        'claimed', exists (select 1 from public.arena_mission_claims c
                           where c.user_id = uid and c.mission_id = m.id
                             and c.period_start = public.arena_period_start(m.period))
      ) order by m.period desc, m.sort, m.id)
      from public.arena_missions m
      cross join lateral (
        select public.arena_mission_progress(uid, m.goals, public.arena_period_start(m.period), public.arena_period_end(m.period)) as progress
      ) p
      cross join lateral (
        select coalesce(bool_and((e->>'have')::numeric >= (e->>'target')::numeric), false) as done,
               p.progress as progress
        from jsonb_array_elements(p.progress) e
      ) pr
      where m.active
        and (run_ok or not public.arena_mission_uses_run(m.module, m.goals))
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.arena_claim_mission(text) from public, anon;
revoke execute on function public.arena_my() from public, anon;
grant execute on function public.arena_claim_mission(text) to authenticated;
grant execute on function public.arena_my() to authenticated;
