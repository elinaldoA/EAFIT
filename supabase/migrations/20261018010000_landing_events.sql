-- Eventos anônimos da landing: cliques nos CTAs, instalação e até onde a
-- pessoa rolou a página. Mesma filosofia de page_visits: sem usuário, IP,
-- user-agent ou cookie — só dia, evento e lugar. A landing deduplica por
-- sessão do navegador (1 registro por evento+lugar por sessão).
--
--   event = 'cta_click'     place = nav | hero | sticky | cta | personal | ...
--   event = 'install_click' place = instalar
--   event = 'install_done'  place = instalar
--   event = 'reach'         place = id da seção (personal, depoimentos, instalar, faq, cta)
--
-- Qualquer um pode inserir (é o ponto): números indicativos, não à prova de
-- spam; os checks só limitam o formato e o painel lê agregado.

create table if not exists public.landing_events (
  id bigint generated always as identity primary key,
  visited_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  event text not null check (event in ('cta_click', 'install_click', 'install_done', 'reach')),
  place text not null check (place ~ '^[a-z0-9_-]{1,40}$'),
  created_at timestamptz not null default now()
);

create index if not exists landing_events_visited_on_idx on public.landing_events (visited_on);

alter table public.landing_events enable row level security;

drop policy if exists "anyone can record a landing event" on public.landing_events;
create policy "anyone can record a landing event" on public.landing_events
  for insert to anon, authenticated
  with check (visited_on = (now() at time zone 'America/Sao_Paulo')::date);

drop policy if exists "admin reads landing events" on public.landing_events;
create policy "admin reads landing events" on public.landing_events
  for select using (public.is_admin());

revoke all on public.landing_events from anon, authenticated;
grant insert (event, place) on public.landing_events to anon, authenticated;

-- Eventos por tipo e lugar nos últimos `days_back` dias (null/<=0 = tudo).
create or replace function public.admin_landing_events(days_back int default 30)
returns table (event text, place text, total bigint)
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
    select e.event, e.place, count(*)::bigint
    from public.landing_events e
    where since is null or e.visited_on >= since
    group by e.event, e.place
    order by count(*) desc, e.event, e.place;
end;
$$;

grant execute on function public.admin_landing_events(int) to authenticated;
