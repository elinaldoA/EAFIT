-- EAFIT Run: avisos dos desafios da comunidade (Edge Function send-run-challenge-alerts).
--
-- Dois avisos, ambos para quem usa o módulo Run (esporte 'corrida' e módulo liberado
-- para a conta, por beta_modules ou por app_settings 'modules'):
--   new   desafio recém-criado no painel (anunciado uma vez, ver announced_at)
--   pass  alguém passou a pessoa no ranking de um desafio em andamento. No máximo um
--         por pessoa e por desafio por dia (alerted_on); a primeira medição só grava a
--         posição (last_rank), sem avisar.
--
-- run_challenge_alerts_collect() decide e já avança o estado na mesma transação:
-- o aviso sai no máximo uma vez (se o push falhar, o sino do app ainda o guarda,
-- gravado pela Edge Function). Só a service role executa.

alter table public.run_challenges add column if not exists announced_at timestamptz;
alter table public.run_challenge_members
  add column if not exists last_rank integer,
  add column if not exists alerted_on date;

create or replace function public.run_challenge_alerts_collect()
returns table (rca_user uuid, rca_kind text, rca_challenge uuid, rca_title text, rca_rank integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  run_open boolean := exists (
    select 1 from public.app_settings s
    where s.key = 'modules' and coalesce(s.value->'enabled', '[]'::jsonb) ? 'corrida'
  );
begin
  -- 1) Desafios novos: um aviso para cada pessoa do Run.
  return query
    with fresh as (
      update public.run_challenges c
      set announced_at = now()
      where c.active and c.announced_at is null and c.end_date >= today
      returning c.id, c.title
    )
    select u.id, 'new'::text, f.id, f.title, null::integer
    from fresh f
    cross join auth.users u
    where u.raw_user_meta_data->>'esporte' = 'corrida'
      and (run_open or coalesce(u.raw_app_meta_data->'beta_modules', '[]'::jsonb) ? 'corrida');

  -- 2) Ultrapassagens nos desafios em andamento.
  return query
    with running as (
      select c.id, c.title, c.metric, c.start_date, c.end_date
      from public.run_challenges c
      where c.active and today between c.start_date and c.end_date
    ),
    scores as (
      select m.challenge_id, m.user_id, m.last_rank, m.alerted_on,
             public.run_challenge_value(r.metric, m.user_id, r.start_date, r.end_date) as val
      from public.run_challenge_members m
      join running r on r.id = m.challenge_id
    ),
    ranked as (
      select s.*, rank() over (partition by s.challenge_id order by s.val desc)::integer as rk
      from scores s
    ),
    upd as (
      update public.run_challenge_members m
      set last_rank = r.rk,
          alerted_on = case
            when r.last_rank is not null and r.rk > r.last_rank and r.val > 0 and r.alerted_on is distinct from today
              then today else m.alerted_on end
      from ranked r
      where m.challenge_id = r.challenge_id and m.user_id = r.user_id and m.last_rank is distinct from r.rk
      returning m.challenge_id, m.user_id, r.rk,
                (r.last_rank is not null and r.rk > r.last_rank and r.val > 0 and r.alerted_on is distinct from today) as fire
    )
    select up.user_id, 'pass'::text, up.challenge_id, ru.title, up.rk
    from upd up
    join running ru on ru.id = up.challenge_id
    where up.fire;
end;
$$;

revoke all on function public.run_challenge_alerts_collect() from public, anon, authenticated;
grant execute on function public.run_challenge_alerts_collect() to service_role;
