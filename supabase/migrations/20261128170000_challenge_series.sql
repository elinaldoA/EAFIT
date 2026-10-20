-- Desafios recorrentes (Comunidade → Desafios). Uma série cria sozinha o
-- desafio oficial de cada semana (segunda a domingo) ou de cada mês, 3 dias
-- antes de começar, para dar tempo de divulgar. O título é o nome da série com
-- o período ("Desafio EAFIT · Novembro", "Semana forte · 24/11").
-- O relatório compara as edições: participantes, quantos treinaram, quantos
-- completaram a meta (min_days) e quantos vieram da edição anterior.

create table if not exists public.challenge_series (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 35),
  cadence text not null check (cadence in ('semanal', 'mensal')),
  min_days int not null default 3 check (min_days between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.challenges
  add column if not exists series_id uuid references public.challenge_series(id) on delete set null;
create index if not exists challenges_series_idx on public.challenges (series_id, start_date);

alter table public.challenge_series enable row level security;
drop policy if exists "admin reads challenge_series" on public.challenge_series;
create policy "admin reads challenge_series" on public.challenge_series for select using (public.is_admin());
drop policy if exists "admin writes challenge_series" on public.challenge_series;
create policy "admin writes challenge_series" on public.challenge_series for all
  using (public.admin_can('content')) with check (public.admin_can('content'));
revoke all on public.challenge_series from anon;

-- Próximo período da série a partir de uma data: semana seguinte (segunda) ou
-- mês seguinte. Se o período atual ainda não tem edição, ele mesmo.
create or replace function public.challenge_series_period(p_cadence text, p_day date)
returns table (ps_start date, ps_end date)
language sql
immutable
as $$
  select s, case when p_cadence = 'semanal' then s + 6 else (s + interval '1 month')::date - 1 end
  from (select case when p_cadence = 'semanal'
                    then p_day - ((extract(isodow from p_day)::int) - 1)
                    else date_trunc('month', p_day)::date end as s) x;
$$;

create or replace function public.challenge_series_title(p_title text, p_cadence text, p_start date)
returns text
language sql
immutable
as $$
  select btrim(p_title) || ' · ' || case when p_cadence = 'semanal' then to_char(p_start, 'DD/MM')
    else (array['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[extract(month from p_start)::int] end;
$$;

-- Cria as edições que faltam: a do período atual (se ainda não acabou) e a do
-- próximo, quando faltam 3 dias ou menos para começar. Devolve quantas criou.
create or replace function public.ops_spawn_series_challenges()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  s record;
  p record;
  code text;
  made int := 0;
begin
  for s in select * from public.challenge_series where active loop
    for p in
      select * from public.challenge_series_period(s.cadence, today)
      union
      select n.* from public.challenge_series_period(s.cadence, today) c,
             lateral public.challenge_series_period(s.cadence, c.ps_end + 1) n
      where n.ps_start - today <= 3
    loop
      continue when exists (select 1 from public.challenges c where c.series_id = s.id and c.start_date = p.ps_start);
      -- A série nova não cria edição já pela metade (começa na próxima).
      continue when p.ps_start < (s.created_at at time zone 'America/Sao_Paulo')::date;
      loop
        code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        exit when not exists (select 1 from public.challenges c where c.invite_code = code);
      end loop;
      insert into public.challenges (owner_id, title, invite_code, start_date, end_date, is_official, series_id)
      values (null, public.challenge_series_title(s.title, s.cadence, p.ps_start), code, p.ps_start, p.ps_end, true, s.id);
      made := made + 1;
    end loop;
  end loop;
  return made;
end;
$$;
revoke execute on function public.ops_spawn_series_challenges() from public, anon, authenticated;

-- "Criar agora" no painel (mesma regra do cron).
create or replace function public.admin_spawn_series_challenges()
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('content') then raise exception 'not_authorized'; end if;
  return public.ops_spawn_series_challenges();
end;
$$;
revoke execute on function public.admin_spawn_series_challenges() from public, anon;
grant execute on function public.admin_spawn_series_challenges() to authenticated;

-- Relatório da série, uma linha por edição (mais recente primeiro).
--   sr_members    participantes (sem personais)
--   sr_trained    treinaram ao menos 1 dia no período
--   sr_completed  treinaram min_days dias ou mais no período
--   sr_returning  participantes que também estavam na edição anterior
--   sr_avg_days   média de dias treinados entre os participantes
create or replace function public.admin_series_report(p_series uuid)
returns table (
  sr_challenge uuid, sr_title text, sr_code text, sr_start date, sr_end date,
  sr_members bigint, sr_trained bigint, sr_completed bigint, sr_returning bigint, sr_avg_days numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  goal int;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select min_days into goal from public.challenge_series where id = p_series;

  return query
    with eds as (
      select c.id, c.title, c.invite_code, c.start_date, c.end_date,
             lag(c.id) over (order by c.start_date) as prev_id
      from public.challenges c where c.series_id = p_series
    ),
    mem as (
      select e.id as ed, m.user_id,
             (select count(*) from public.training_days() t
               where t.user_id = m.user_id and t.day between e.start_date and e.end_date) as days
      from eds e join public.challenge_members m on m.challenge_id = e.id and m.role = 'member'
    )
    select e.id, e.title, e.invite_code, e.start_date, e.end_date,
           (select count(*) from mem where mem.ed = e.id),
           (select count(*) from mem where mem.ed = e.id and mem.days > 0),
           (select count(*) from mem where mem.ed = e.id and mem.days >= goal),
           (select count(*) from mem where mem.ed = e.id
              and exists (select 1 from public.challenge_members pm where pm.challenge_id = e.prev_id and pm.user_id = mem.user_id)),
           (select round(avg(mem.days), 1) from mem where mem.ed = e.id)
    from eds e
    order by e.start_date desc;
end;
$$;
revoke execute on function public.admin_series_report(uuid) from public, anon;
grant execute on function public.admin_series_report(uuid) to authenticated;

-- Todo dia às 6h de Brasília (9h UTC), sem Edge Function.
select cron.schedule('spawn-series-challenges-daily', '0 9 * * *', $$ select public.ops_spawn_series_challenges(); $$);
