-- Engajamento nas páginas do site: quanto tempo a pessoa ficou com a aba
-- visível e até onde rolou. Complementa site_pageviews (20261214010000), que só
-- diz que a página foi aberta.
--
-- O site manda 1 linha quando a pessoa sai da página ou troca de aba. Não há
-- ligação com a linha do pageview: o painel cruza só por página, em
-- agregado. Mesma filosofia das outras tabelas anônimas: sem IP, user-agent ou
-- cookie; só dia, página, tempo, rolagem e o identificador do navegador.
--
-- Limitação: a página manda o sinal uma vez, na primeira saída da aba. Quem
-- volta depois (ex.: troca de app no celular) não soma o tempo seguinte.

create table if not exists public.site_engagement (
  id bigint generated always as identity primary key,
  visited_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  path text not null check (path ~ '^[a-z0-9_/-]{1,60}$'),
  seconds int not null check (seconds between 0 and 1800),
  scroll smallint not null check (scroll between 0 and 100),
  visitor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists site_engagement_visited_on_idx on public.site_engagement (visited_on);

alter table public.site_engagement enable row level security;

drop policy if exists "anyone can record engagement" on public.site_engagement;
create policy "anyone can record engagement" on public.site_engagement
  for insert to anon, authenticated
  with check (visited_on = (now() at time zone 'America/Sao_Paulo')::date);

drop policy if exists "admin reads engagement" on public.site_engagement;
create policy "admin reads engagement" on public.site_engagement
  for select using (public.is_admin());

revoke all on public.site_engagement from anon, authenticated;
grant insert (path, seconds, scroll, visitor_id) on public.site_engagement to anon, authenticated;

drop trigger if exists site_engagement_daily_cap on public.site_engagement;
create trigger site_engagement_daily_cap
  before insert on public.site_engagement
  for each row execute function public.enforce_daily_insert_cap(30000);

-- Por página nos últimos `days_back` dias (null/<=0 = tudo): quantas saídas
-- foram medidas, tempo mediano, rolagem média e quantas saíram rápido
-- (menos de 10s e menos de 25% da página).
create or replace function public.admin_site_engagement(days_back int default 30)
returns table (path text, measured bigint, median_seconds bigint, avg_scroll int, quick_exits bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select e.path,
           count(*)::bigint,
           round(percentile_cont(0.5) within group (order by e.seconds))::bigint,
           round(avg(e.scroll))::int,
           (count(*) filter (where e.seconds < 10 and e.scroll < 25))::bigint
    from public.site_engagement e
    where since is null or e.visited_on >= since
    group by e.path
    order by count(*) desc, e.path;
end;
$$;

grant execute on function public.admin_site_engagement(int) to authenticated;
