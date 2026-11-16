-- EAFIT Run: meta coletiva de km do mes do clube.
--
-- O dono do clube define uma meta de km para o mes (a mesma todo mes, ate
-- mudar ou tirar). O progresso e a soma do ranking do mes que o app ja mostra.
-- Os membros veem a meta; so o dono muda. Meta nula = clube sem meta.

alter table public.run_clubs
  add column if not exists goal_km integer check (goal_km is null or goal_km between 10 and 100000);

-- Meta do clube (km do mes) ou null. So quem e do clube.
create or replace function public.run_club_goal(p_club uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.run_club_members m where m.club_id = p_club and m.user_id = uid) then
    raise exception 'not_found';
  end if;
  select c.goal_km into g from public.run_clubs c where c.id = p_club;
  return g;
end;
$$;

-- O dono define (10 a 100000 km) ou tira (null) a meta.
create or replace function public.set_run_club_goal(p_club uuid, p_km integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_km is not null and (p_km < 10 or p_km > 100000) then raise exception 'invalid_goal'; end if;
  update public.run_clubs set goal_km = p_km where id = p_club and owner_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
end;
$$;

revoke all on function public.run_club_goal(uuid) from public, anon;
revoke all on function public.set_run_club_goal(uuid, integer) from public, anon;
grant execute on function public.run_club_goal(uuid) to authenticated;
grant execute on function public.set_run_club_goal(uuid, integer) to authenticated;
