-- Liga mensal (Comunidade → Ligas). Só participa quem entra pelo app
-- ("Participar da liga"), e o ranking mostra apelido ou primeiro nome.
-- A divisão do mês sai dos dias treinados no mês anterior:
--   ouro 14+ dias, prata 8 a 13, bronze o resto (inclui quem acabou de entrar).
-- Dentro da divisão vence quem treinar mais dias no mês (horário de Brasília).
-- No dia 1º o cron fecha o mês anterior: guarda o resultado de todos em
-- league_results e dá a medalha liga_<divisão>_<posição>_<AAAA-MM> aos 3
-- primeiros de cada divisão (com pelo menos 1 dia), com aviso na caixa do app.
-- Liga ligada/desligada em app_settings 'league' {enabled}.

insert into public.app_settings (key, value) values ('league', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.league_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table if not exists public.league_results (
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  division text not null check (division in ('bronze', 'prata', 'ouro')),
  days int not null,
  position int not null,
  primary key (month, user_id)
);
create index if not exists league_results_user_idx on public.league_results (user_id);

alter table public.league_members enable row level security;
alter table public.league_results enable row level security;
drop policy if exists "own league membership" on public.league_members;
create policy "own league membership" on public.league_members for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "own league results" on public.league_results;
create policy "own league results" on public.league_results for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.league_members from anon;
revoke all on public.league_results from anon;

create or replace function public.league_division(p_days bigint)
returns text
language sql
immutable
as $$
  select case when p_days >= 14 then 'ouro' when p_days >= 8 then 'prata' else 'bronze' end;
$$;

-- Classificação do mês (1º dia do mês) entre os membros da liga.
create or replace function public.league_standings(p_month date)
returns table (ls_user uuid, ls_division text, ls_days bigint, ls_position int)
language sql
stable
security definer
set search_path = public, auth
as $$
  with mem as (
    select m.user_id from public.league_members m
    left join public.profiles p on p.id = m.user_id
    where not coalesce(p.is_admin, false)
      and (m.joined_at at time zone 'America/Sao_Paulo')::date < (p_month + interval '1 month')::date
  ),
  td as (
    select t.user_id, t.day from public.training_days() t
    where t.user_id in (select user_id from mem)
      and t.day >= (p_month - interval '1 month')::date and t.day < (p_month + interval '1 month')::date
  ),
  agg as (
    select mem.user_id,
           public.league_division((select count(*) from td where td.user_id = mem.user_id and td.day < p_month)) as division,
           (select count(*) from td where td.user_id = mem.user_id and td.day >= p_month) as days
    from mem
  )
  select a.user_id, a.division, a.days, (rank() over (partition by a.division order by a.days desc))::int
  from agg a;
$$;
revoke execute on function public.league_standings(date) from public, anon, authenticated;

create or replace function public.league_display_name(p_user uuid)
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
revoke execute on function public.league_display_name(uuid) from public, anon, authenticated;

-- O que o app mostra: liga ligada? sou membro? minha divisão, posição e dias,
-- os 10 primeiros da divisão e meu último resultado fechado.
create or replace function public.my_league()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  m0 date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  out jsonb;
begin
  if auth.uid() is null then return null; end if;
  if not coalesce((select (value->>'enabled')::boolean from public.app_settings where key = 'league'), false) then
    return jsonb_build_object('enabled', false);
  end if;
  if not exists (select 1 from public.league_members where user_id = auth.uid()) then
    return jsonb_build_object('enabled', true, 'member', false, 'members', (select count(*) from public.league_members));
  end if;

  with s as materialized (select * from public.league_standings(m0)),
       mine as (select * from s where s.ls_user = auth.uid())
  select jsonb_build_object(
    'enabled', true, 'member', true, 'month', to_char(m0, 'YYYY-MM'),
    'division', mine.ls_division, 'days', coalesce(mine.ls_days, 0), 'position', mine.ls_position,
    'size', (select count(*) from s where s.ls_division = mine.ls_division),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', public.league_display_name(t.ls_user), 'days', t.ls_days,
                                          'position', t.ls_position, 'me', t.ls_user = auth.uid())
                       order by t.ls_position, t.ls_user)
      from (select * from s where s.ls_division = mine.ls_division order by s.ls_position, s.ls_user limit 10) t
    ), '[]'::jsonb),
    'last', (select jsonb_build_object('month', r.month, 'division', r.division, 'position', r.position, 'days', r.days)
             from public.league_results r where r.user_id = auth.uid() order by r.month desc limit 1)
  ) into out
  from mine;
  -- Admin que entrou não concorre (fica fora da classificação).
  return coalesce(out, jsonb_build_object('enabled', true, 'member', true, 'top', '[]'::jsonb));
end;
$$;
revoke execute on function public.my_league() from public, anon;
grant execute on function public.my_league() to authenticated;

create or replace function public.join_league()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authorized'; end if;
  insert into public.league_members (user_id) values (auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.leave_league()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.league_members where user_id = auth.uid();
end;
$$;
revoke execute on function public.join_league() from public, anon;
revoke execute on function public.leave_league() from public, anon;
grant execute on function public.join_league() to authenticated;
grant execute on function public.leave_league() to authenticated;

-- Fecha um mês (padrão: o anterior). Pode rodar de novo sem duplicar nada.
create or replace function public.ops_close_league(p_month text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  m0 date;
  label text;
  made int;
begin
  m0 := coalesce((p_month || '-01')::date,
                 (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date);
  label := (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month from m0)::int];

  insert into public.league_results (month, user_id, division, days, position)
  select to_char(m0, 'YYYY-MM'), s.ls_user, s.ls_division, s.ls_days, s.ls_position
  from public.league_standings(m0) s
  on conflict (month, user_id) do update set division = excluded.division, days = excluded.days, position = excluded.position;

  with winners as (
    select r.user_id, r.division, r.position from public.league_results r
    where r.month = to_char(m0, 'YYYY-MM') and r.position <= 3 and r.days > 0
  ),
  ins as (
    insert into public.achievements (user_id, badge_id)
    select w.user_id, format('liga_%s_%s_%s', w.division, w.position, to_char(m0, 'YYYY-MM')) from winners w
    on conflict (user_id, badge_id) do nothing
    returning user_id, badge_id
  ),
  note as (
    insert into public.user_notifications (user_id, kind, title, body)
    select ins.user_id, 'aviso', '🏅 Medalha da liga',
           format('Você ficou em %sº na divisão %s de %s. A medalha já está nas suas conquistas.',
                  split_part(ins.badge_id, '_', 3), initcap(split_part(ins.badge_id, '_', 2)), label)
    from ins
    returning 1
  )
  select count(*) into made from note;
  return made;
end;
$$;
revoke execute on function public.ops_close_league(text) from public, anon, authenticated;

-- Painel: classificação do mês (AAAA-MM) com e-mail. Mês fechado lê o
-- resultado guardado; o mês atual é calculado na hora.
create or replace function public.admin_league_standings(p_month text)
returns table (lg_user uuid, lg_email text, lg_name text, lg_division text, lg_days bigint, lg_position int, lg_closed boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid_month'; end if;
  if exists (select 1 from public.league_results r where r.month = p_month) then
    return query
      select r.user_id, u.email::text, public.league_display_name(r.user_id), r.division, r.days::bigint, r.position, true
      from public.league_results r join auth.users u on u.id = r.user_id
      where r.month = p_month order by r.division, r.position;
  else
    return query
      select s.ls_user, u.email::text, public.league_display_name(s.ls_user), s.ls_division, s.ls_days, s.ls_position, false
      from public.league_standings((p_month || '-01')::date) s join auth.users u on u.id = s.ls_user
      order by s.ls_division, s.ls_position;
  end if;
end;
$$;
revoke execute on function public.admin_league_standings(text) from public, anon;
grant execute on function public.admin_league_standings(text) to authenticated;

-- "Fechar mês agora" no painel (mesma regra do cron).
create or replace function public.admin_close_league(p_month text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare made int;
begin
  if not public.admin_can('content') then raise exception 'not_authorized'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid_month'; end if;
  if (p_month || '-01')::date >= date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date then
    raise exception 'month_not_over';
  end if;
  made := public.ops_close_league(p_month);
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'closeLeague', jsonb_build_object('month', p_month, 'medals', made));
  return made;
end;
$$;
revoke execute on function public.admin_close_league(text) from public, anon;
grant execute on function public.admin_close_league(text) to authenticated;

-- Dia 1º às 6h de Brasília (9h UTC).
select cron.schedule('close-league-monthly', '0 9 1 * *', $$ select public.ops_close_league(); $$);
