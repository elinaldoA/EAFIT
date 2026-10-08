-- Sistema operacional de cada visita anônima, pra saber no painel se a
-- divulgação traz gente de Android, iOS ou desktop.
--
-- Continua anônimo: o navegador classifica o próprio aparelho numa de poucas
-- categorias e manda só essa palavra. Nada de user-agent, modelo, IP ou cookie.
-- Quem grava (mesma regra duplicada, a landing não tem build):
--   app-react/src/lib/pageVisits.js (detectOS)
--   <script> de app-react/public/landing/index.html
--
-- Visitas anteriores a esta migration ficam como 'desconhecido'. O app e a
-- landing tentam gravar com o sistema e, se o banco recusar (migration ainda
-- não aplicada), gravam sem ele — a ordem entre deploy e migration não perde
-- visitas.

alter table public.page_visits
  add column if not exists os text not null default 'desconhecido';

alter table public.page_visits drop constraint if exists page_visits_os_check;
alter table public.page_visits add constraint page_visits_os_check
  check (os in ('android', 'ios', 'windows', 'mac', 'linux', 'outro', 'desconhecido'));

-- Visitante continua só inserindo; agora pode informar também o sistema.
grant insert (page, source, os) on public.page_visits to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Visitas por página e sistema nos últimos `days_back` dias (null/<=0 = tudo).
-- ---------------------------------------------------------------------------
create or replace function public.admin_visit_os(days_back int default 30)
returns table (page text, os text, visits bigint)
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
    select v.page, v.os, count(*)::bigint
    from public.page_visits v
    where since is null or v.visited_on >= since
    group by v.page, v.os
    order by count(*) desc, v.page, v.os;
end;
$$;

grant execute on function public.admin_visit_os(int) to authenticated;
